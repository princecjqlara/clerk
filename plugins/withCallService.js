const { withAndroidManifest, withMainActivity, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function addPermissions(androidManifest) {
  const permissions = [
    'android.permission.ANSWER_PHONE_CALLS',
    'android.permission.READ_PHONE_STATE',
    'android.permission.CALL_PHONE',
    'android.permission.READ_CALL_LOG',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
    'android.permission.MANAGE_OWN_CALLS',
    'android.permission.READ_CONTACTS',
  ];

  const manifest = androidManifest.manifest;
  if (!manifest['uses-permission']) {
    manifest['uses-permission'] = [];
  }

  permissions.forEach((perm) => {
    const exists = manifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === perm
    );
    if (!exists) {
      manifest['uses-permission'].push({
        $: { 'android:name': perm },
      });
    }
  });

  return androidManifest;
}

function addServices(androidManifest) {
  const app = androidManifest.manifest.application[0];
  if (!app.service) app.service = [];

  // CallScreeningService
  const screeningExists = app.service.some(
    (s) => s.$?.['android:name'] === '.service.AICallScreeningService'
  );
  if (!screeningExists) {
    app.service.push({
      $: {
        'android:name': '.service.AICallScreeningService',
        'android:permission': 'android.permission.BIND_SCREENING_SERVICE',
        'android:exported': 'true',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.telecom.CallScreeningService' } }],
        },
      ],
    });
  }

  // InCallService
  const inCallExists = app.service.some(
    (s) => s.$?.['android:name'] === '.service.AIInCallService'
  );
  if (!inCallExists) {
    app.service.push({
      $: {
        'android:name': '.service.AIInCallService',
        'android:permission': 'android.permission.BIND_INCALL_SERVICE',
        'android:exported': 'true',
        'android:foregroundServiceType': 'phoneCall',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.telecom.InCallService' } }],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.telecom.IN_CALL_SERVICE_UI',
            'android:value': 'true',
          },
        },
      ],
    });
  }

  return androidManifest;
}

function withCallServiceManifest(config) {
  return withAndroidManifest(config, (config) => {
    config.modResults = addPermissions(config.modResults);
    config.modResults = addServices(config.modResults);
    return config;
  });
}

function withNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android?.package || 'com.aireceptionist';
      const packagePath = packageName.replace(/\./g, '/');
      const srcDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...packagePath.split('/')
      );
      const serviceDir = path.join(srcDir, 'service');
      const moduleDir = path.join(srcDir, 'module');

      fs.mkdirSync(serviceDir, { recursive: true });
      fs.mkdirSync(moduleDir, { recursive: true });

      // Write AICallScreeningService.kt
      fs.writeFileSync(
        path.join(serviceDir, 'AICallScreeningService.kt'),
        getScreeningServiceCode(packageName)
      );

      // Write AIInCallService.kt
      fs.writeFileSync(
        path.join(serviceDir, 'AIInCallService.kt'),
        getInCallServiceCode(packageName)
      );

      // Write AICallModule.kt (React Native bridge)
      fs.writeFileSync(
        path.join(moduleDir, 'AICallModule.kt'),
        getCallModuleCode(packageName)
      );

      // Write AICallPackage.kt
      fs.writeFileSync(
        path.join(moduleDir, 'AICallPackage.kt'),
        getCallPackageCode(packageName)
      );

      return config;
    },
  ]);
}

function getScreeningServiceCode(packageName) {
  return `package ${packageName}.service

import android.telecom.Call
import android.telecom.CallScreeningService
import android.content.SharedPreferences
import ${packageName}.module.AICallModule

class AICallScreeningService : CallScreeningService() {

    override fun onScreenCall(callDetails: Call.Details) {
        val prefs = getSharedPreferences("ai_receptionist", MODE_PRIVATE)
        val isEnabled = prefs.getBoolean("enabled", false)

        if (isEnabled) {
            // Allow the call through - our InCallService will handle it
            val response = CallResponse.Builder()
                .setDisallowCall(false)
                .setRejectCall(false)
                .setSilenceCall(false)
                .setSkipCallLog(false)
                .setSkipNotification(false)
                .build()
            respondToCall(callDetails, response)

            // Notify JS side about incoming call
            val phoneNumber = callDetails.handle?.schemeSpecificPart ?: "Unknown"
            AICallModule.sendEvent("onIncomingCall", mapOf(
                "phoneNumber" to phoneNumber,
                "callId" to callDetails.hashCode().toString()
            ))
        } else {
            val response = CallResponse.Builder()
                .setDisallowCall(false)
                .setRejectCall(false)
                .setSilenceCall(false)
                .setSkipCallLog(false)
                .setSkipNotification(false)
                .build()
            respondToCall(callDetails, response)
        }
    }
}
`;
}

function getInCallServiceCode(packageName) {
  return `package ${packageName}.service

import android.telecom.Call
import android.telecom.InCallService
import android.telecom.VideoProfile
import android.media.AudioManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import ${packageName}.module.AICallModule

class AIInCallService : InCallService() {

    private val handler = Handler(Looper.getMainLooper())
    private var currentCall: Call? = null

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            when (state) {
                Call.STATE_ACTIVE -> {
                    setupAudio()
                    AICallModule.sendEvent("onCallAnswered", mapOf(
                        "phoneNumber" to (call.details?.handle?.schemeSpecificPart ?: "Unknown"),
                        "callId" to call.hashCode().toString()
                    ))
                }
                Call.STATE_DISCONNECTED -> {
                    AICallModule.sendEvent("onCallDisconnected", mapOf(
                        "phoneNumber" to (call.details?.handle?.schemeSpecificPart ?: "Unknown"),
                        "callId" to call.hashCode().toString()
                    ))
                    currentCall = null
                }
            }
        }
    }

    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        currentCall = call
        call.registerCallback(callCallback)

        val prefs = getSharedPreferences("ai_receptionist", MODE_PRIVATE)
        val isEnabled = prefs.getBoolean("enabled", false)

        if (isEnabled && call.state == Call.STATE_RINGING) {
            // Auto-answer after a short delay
            handler.postDelayed({
                call.answer(VideoProfile.STATE_AUDIO_ONLY)
            }, 1000)
        }
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        call.unregisterCallback(callCallback)
        if (currentCall == call) {
            currentCall = null
        }
    }

    private fun setupAudio() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = true
    }

    fun answerCurrentCall() {
        currentCall?.answer(VideoProfile.STATE_AUDIO_ONLY)
    }

    fun disconnectCurrentCall() {
        currentCall?.disconnect()
    }

    companion object {
        var instance: AIInCallService? = null
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }
}
`;
}

function getCallModuleCode(packageName) {
  return `package ${packageName}.module

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.TelecomManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import ${packageName}.service.AIInCallService

class AICallModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AICallModule"

    @ReactMethod
    fun setReceptionistEnabled(enabled: Boolean, promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("ai_receptionist", Context.MODE_PRIVATE)
        prefs.edit().putBoolean("enabled", enabled).apply()
        promise.resolve(true)
    }

    @ReactMethod
    fun isReceptionistEnabled(promise: Promise) {
        val prefs = reactApplicationContext.getSharedPreferences("ai_receptionist", Context.MODE_PRIVATE)
        promise.resolve(prefs.getBoolean("enabled", false))
    }

    @ReactMethod
    fun answerCall(callId: String, promise: Promise) {
        try {
            AIInCallService.instance?.answerCurrentCall()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun disconnectCall(callId: String, promise: Promise) {
        try {
            AIInCallService.instance?.disconnectCurrentCall()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun requestPermissions(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("ERROR", "No activity")
            return
        }

        val permissions = arrayOf(
            Manifest.permission.ANSWER_PHONE_CALLS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.READ_CALL_LOG,
            Manifest.permission.RECORD_AUDIO,
        )

        val needed = permissions.filter {
            ContextCompat.checkSelfPermission(activity, it) != PackageManager.PERMISSION_GRANTED
        }

        if (needed.isEmpty()) {
            promise.resolve(true)
        } else {
            ActivityCompat.requestPermissions(activity, needed.toTypedArray(), 1001)
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun requestDefaultDialer(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("ERROR", "No activity")
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val roleManager = activity.getSystemService(Context.ROLE_SERVICE) as RoleManager
                if (!roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
                    val intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER)
                    activity.startActivityForResult(intent, 1002)
                }
            } else {
                val telecomManager = activity.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
                if (telecomManager.defaultDialerPackage != activity.packageName) {
                    val intent = Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
                    intent.putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, activity.packageName)
                    activity.startActivity(intent)
                }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    companion object {
        private var reactContext: ReactApplicationContext? = null

        fun init(context: ReactApplicationContext) {
            reactContext = context
        }

        fun sendEvent(eventName: String, params: Map<String, String>) {
            val ctx = reactContext ?: return
            val map = Arguments.createMap()
            params.forEach { (key, value) -> map.putString(key, value) }
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, map)
        }
    }

    init {
        init(reactContext)
    }
}
`;
}

function getCallPackageCode(packageName) {
  return `package ${packageName}.module

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AICallPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(AICallModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;
}

function withCallService(config) {
  config = withCallServiceManifest(config);
  config = withNativeFiles(config);
  return config;
}

module.exports = withCallService;
