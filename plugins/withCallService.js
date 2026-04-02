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
    'android.permission.INTERNET',
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

function addDialerIntentFilters(androidManifest) {
  const app = androidManifest.manifest.application[0];
  if (!app.activity) app.activity = [];

  // Find MainActivity and add ACTION_DIAL intent filter (required to be eligible as default dialer)
  const mainActivity = app.activity.find(
    (a) => a.$?.['android:name'] === '.MainActivity'
  );
  if (mainActivity) {
    if (!mainActivity['intent-filter']) mainActivity['intent-filter'] = [];

    // Add ACTION_DIAL intent filter
    const hasDialFilter = mainActivity['intent-filter'].some((f) =>
      f.action?.some((a) => a.$?.['android:name'] === 'android.intent.action.DIAL')
    );
    if (!hasDialFilter) {
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      });
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.DIAL' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:scheme': 'tel' } }],
      });
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.CALL_BUTTON' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      });
    }
  }

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
    config.modResults = addDialerIntentFilters(config.modResults);
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

      // Write AudioBridge.kt
      fs.writeFileSync(
        path.join(serviceDir, 'AudioBridge.kt'),
        getAudioBridgeCode(packageName)
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
import android.util.Log
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import ${packageName}.module.AICallModule

class AIInCallService : InCallService() {

    companion object {
        private const val TAG = "AIInCallService"
        var instance: AIInCallService? = null
    }

    private val handler = Handler(Looper.getMainLooper())
    private var currentCall: Call? = null
    private var audioBridge: AudioBridge? = null
    private var callStartTime: Long = 0

    private val callCallback = object : Call.Callback() {
        override fun onStateChanged(call: Call, state: Int) {
            val phoneNumber = call.details?.handle?.schemeSpecificPart ?: "Unknown"
            val callId = call.hashCode().toString()

            when (state) {
                Call.STATE_ACTIVE -> {
                    callStartTime = System.currentTimeMillis()
                    setupAudioForCall()

                    AICallModule.sendEvent("onCallAnswered", mapOf(
                        "phoneNumber" to phoneNumber,
                        "callId" to callId
                    ))

                    // Start the AI conversation loop via AudioBridge
                    startAIConversation(callId, phoneNumber)
                }
                Call.STATE_DISCONNECTED -> {
                    val duration = if (callStartTime > 0) {
                        ((System.currentTimeMillis() - callStartTime) / 1000).toInt()
                    } else 0

                    stopAIConversation()

                    AICallModule.sendEvent("onCallDisconnected", mapOf(
                        "phoneNumber" to phoneNumber,
                        "callId" to callId,
                        "duration" to duration.toString()
                    ))

                    // Show notification that call was handled
                    showCallCompletedNotification(phoneNumber, duration)

                    currentCall = null
                    callStartTime = 0
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
            stopAIConversation()
            currentCall = null
        }
    }

    private fun setupAudioForCall() {
         val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
         audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
         // Enable speakerphone so USAGE_VOICE_COMMUNICATION AudioTrack output
         // routes through the telephony uplink to the remote caller.
         // Without this, TTS audio only plays locally through earpiece and
         // the remote caller hears nothing.
         audioManager.isSpeakerphoneOn = true
         Log.d(TAG, "Audio setup: MODE_IN_COMMUNICATION, speakerphone=ON")
     }

     private fun startAIConversation(callId: String, phoneNumber: String) {
         Log.d(TAG, "Starting AI conversation for call $callId from $phoneNumber")

         audioBridge = AudioBridge(this) { event, data ->
             // Forward AudioBridge events to JS via AICallModule
             val eventData = data.toMutableMap()
             eventData["callId"] = callId
             eventData["phoneNumber"] = phoneNumber
             AICallModule.sendEvent(event, eventData)
         }

         // Delay start to let audio system settle after call connection
         handler.postDelayed({
             audioBridge?.start()
         }, 500)
     }

    private fun stopAIConversation() {
        Log.d(TAG, "Stopping AI conversation")
        audioBridge?.stop()
        audioBridge = null
    }

    fun answerCurrentCall() {
        currentCall?.answer(VideoProfile.STATE_AUDIO_ONLY)
    }

    fun disconnectCurrentCall() {
        currentCall?.disconnect()
    }

    fun stopAI() {
        stopAIConversation()
    }

    fun getAudioBridge(): AudioBridge? = audioBridge

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    private fun showCallCompletedNotification(phoneNumber: String, duration: Int) {
        try {
            val channelId = "ai_call_completed"
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Create notification channel (required for Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    channelId,
                    "AI Call Completed",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Notifications when AI receptionist completes a call"
                }
                notificationManager.createNotificationChannel(channel)
            }

            val minutes = duration / 60
            val seconds = duration % 60
            val durationText = String.format("%d:%02d", minutes, seconds)

            val notification = NotificationCompat.Builder(this, channelId)
                .setSmallIcon(android.R.drawable.ic_menu_call)
                .setContentTitle("AI Call Completed")
                .setContentText("Call from $phoneNumber handled by AI ($durationText)")
                .setStyle(NotificationCompat.BigTextStyle()
                    .bigText("Call from $phoneNumber was answered and handled by your AI receptionist.\\nDuration: $durationText\\nTap to view details."))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .build()

            notificationManager.notify(System.currentTimeMillis().toInt(), notification)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to show notification: \${e.message}")
        }
    }

    override fun onDestroy() {
        stopAIConversation()
        instance = null
        super.onDestroy()
    }
}
`;
}

function getAudioBridgeCode(packageName) {
  return `package ${packageName}.service

import android.content.Context
import android.media.*
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.sqrt

/**
 * AudioBridge manages the full AI conversation loop during a phone call:
 *   1. Play welcome message or TTS greeting to caller
 *   2. Record caller voice from call audio stream
 *   3. Detect silence -> send audio to STT
 *   4. Get AI response via JS bridge callback
 *   5. Generate TTS and play response to caller
 *   6. Loop until call ends
 *
 * Audio routing:
 *   - Playback: USAGE_VOICE_COMMUNICATION so caller hears TTS through the call
 *   - Capture: VOICE_COMMUNICATION source at 16kHz mono for call audio
 */
class AudioBridge(
    private val context: Context,
    private val eventCallback: (eventName: String, data: Map<String, String>) -> Unit
) {
    companion object {
        private const val TAG = "AudioBridge"
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val SILENCE_THRESHOLD_RMS = 500.0
        private const val SILENCE_DURATION_MS = 1500L
        private const val MIN_SPEECH_DURATION_MS = 500L
        private const val MAX_RECORD_DURATION_MS = 30000L

        // Direct API endpoints — no proxy needed
        private const val DEEPGRAM_STT_URL = "https://api.deepgram.com/v1/listen?model=nova-3&language=tl&punctuate=true&smart_format=true&numerals=true"
        private const val ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/"
        private const val NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

        // API keys — loaded from SharedPreferences (set by tenant config)
        var deepgramApiKey: String = "7288b46b415eda427fab877bfd25ce6299bd5f6e"
        var elevenLabsApiKey: String = "sk_738f0122aa988e8f154b8ba46598301cc61787b3a0ee894b"
        var nvidiaApiKey: String = "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"
        var elevenLabsVoiceId: String = "EXAVITQu4vr4xnSDxMaL"
        var aiModel: String = "meta/llama-3.3-70b-instruct"

        // Legacy — kept for backward compat but not used for API calls
        var proxyBaseUrl: String = "http://10.0.2.2:3456"
    }

    // State
    enum class State {
        IDLE, PLAYING_WELCOME, LISTENING, PROCESSING_STT, WAITING_AI, PLAYING_RESPONSE, STOPPED
    }

    @Volatile private var state: State = State.IDLE
    @Volatile private var isRunning = false

    // Audio recording
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private val recordedAudio = ByteArrayOutputStream()

    // Audio playback
    private var audioTrack: AudioTrack? = null

    // Silence detection
    @Volatile private var lastSpeechTime = 0L
    @Volatile private var recordingStartTime = 0L
    @Volatile private var hasSpeechStarted = false

    // Handler for async work
    private val handlerThread = HandlerThread("AudioBridgeWorker").apply { start() }
    private val workerHandler = Handler(handlerThread.looper)

    // Transcript accumulator
    private val transcript = mutableListOf<Map<String, String>>()

    // AI response callback — set by JS bridge when AI responds
    @Volatile var pendingAIResponse: String? = null
    private val aiResponseLock = Object()

    fun start() {
        if (isRunning) return
        isRunning = true
        state = State.IDLE

        Log.d(TAG, "AudioBridge starting conversation loop")
        emitEvent("onCallFlowUpdate", mapOf("state" to "starting"))

        workerHandler.post {
            runConversationLoop()
        }
    }

    fun stop() {
        Log.d(TAG, "AudioBridge stopping")
        isRunning = false
        state = State.STOPPED

        stopRecording()
        stopPlayback()

        // Wake up any thread waiting for AI response
        synchronized(aiResponseLock) {
            aiResponseLock.notifyAll()
        }

        handlerThread.quitSafely()
        emitEvent("onCallFlowUpdate", mapOf("state" to "stopped"))
    }

    fun supplyAIResponse(response: String) {
        synchronized(aiResponseLock) {
            pendingAIResponse = response
            aiResponseLock.notifyAll()
        }
    }

    fun getTranscript(): List<Map<String, String>> = transcript.toList()

    // ===================== MAIN CONVERSATION LOOP =====================

    private fun runConversationLoop() {
        try {
            // Step 1: Play welcome message
            state = State.PLAYING_WELCOME
            emitEvent("onCallFlowUpdate", mapOf("state" to "playing_welcome"))

            val welcomePlayed = playWelcomeAudio()
            if (!isRunning) return

            if (!welcomePlayed) {
                // No prerecorded welcome — request greeting from JS/AI
                emitEvent("onCallFlowUpdate", mapOf("state" to "requesting_greeting"))
                emitEvent("onRequestGreeting", mapOf("type" to "initial"))

                // Wait for AI greeting to come back
                val greeting = waitForAIResponse(15000)
                if (!isRunning) return

                if (greeting != null) {
                    transcript.add(mapOf("role" to "ai", "text" to greeting))
                    emitEvent("onAIResponse", mapOf("text" to greeting))

                    // Generate and play TTS for the greeting
                    val ttsPlayed = playTTSResponse(greeting)
                    if (!ttsPlayed) {
                        Log.w(TAG, "Failed to play TTS greeting")
                    }
                }
            }

            // Step 2: Conversation loop
            while (isRunning) {
                if (!isRunning) break

                // Listen for caller speech
                state = State.LISTENING
                emitEvent("onCallFlowUpdate", mapOf("state" to "listening"))

                val audioData = recordCallerSpeech()
                if (!isRunning || audioData == null || audioData.isEmpty()) {
                    if (isRunning) {
                        // No speech detected, keep listening
                        continue
                    }
                    break
                }

                // Send to STT
                state = State.PROCESSING_STT
                emitEvent("onCallFlowUpdate", mapOf("state" to "transcribing"))

                val transcription = sendToSTT(audioData)
                if (!isRunning) break

                if (transcription.isNullOrBlank()) {
                    Log.d(TAG, "Empty transcription, resuming listening")
                    continue
                }

                Log.d(TAG, "Caller said: $transcription")
                transcript.add(mapOf("role" to "caller", "text" to transcription))
                emitEvent("onTranscription", mapOf("text" to transcription))

                // Request AI response from JS side
                state = State.WAITING_AI
                emitEvent("onCallFlowUpdate", mapOf("state" to "thinking"))
                emitEvent("onRequestAIResponse", mapOf("text" to transcription))

                val aiResponse = waitForAIResponse(20000)
                if (!isRunning) break

                if (aiResponse.isNullOrBlank()) {
                    Log.w(TAG, "No AI response received, resuming listening")
                    continue
                }

                Log.d(TAG, "AI response: $aiResponse")
                transcript.add(mapOf("role" to "ai", "text" to aiResponse))
                emitEvent("onAIResponse", mapOf("text" to aiResponse))

                // Generate TTS and play to caller
                state = State.PLAYING_RESPONSE
                emitEvent("onCallFlowUpdate", mapOf("state" to "speaking"))

                val played = playTTSResponse(aiResponse)
                if (!isRunning) break

                if (!played) {
                    Log.w(TAG, "Failed to play TTS response")
                }

                // Small pause before next listen cycle
                Thread.sleep(300)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Conversation loop error", e)
            emitEvent("onCallFlowUpdate", mapOf("state" to "error", "error" to (e.message ?: "Unknown error")))
        } finally {
            stopRecording()
            stopPlayback()
        }
    }

    // ===================== WELCOME MESSAGE =====================

    private fun playWelcomeAudio(): Boolean {
        // Generate welcome greeting directly via ElevenLabs
        try {
            val welcomeText = "Hello po! Salamat sa pag-tawag. Paano ko po kayo matutulungan ngayon?"
            val audioBytes = fetchElevenLabsTTS(welcomeText)
            if (audioBytes != null && audioBytes.isNotEmpty()) {
                playAudioToCall(audioBytes)
                return true
            }
        } catch (e: Exception) {
            Log.w(TAG, "Welcome TTS failed: \${e.message}")
        }
        return false
    }

    // ===================== VOICE RECORDING =====================

    private fun recordCallerSpeech(): ByteArray? {
         val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
         if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
             Log.e(TAG, "Invalid AudioRecord buffer size")
             return null
         }

         val bufferSize = maxOf(minBufferSize * 2, SAMPLE_RATE * 2) // At least 1 second buffer

         try {
             // Try VOICE_COMMUNICATION first (captures call audio on most devices)
             // Fall back to MIC if it fails (some devices/ROMs don't support VOICE_COMMUNICATION)
             val audioSources = listOf(
                 MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                 MediaRecorder.AudioSource.MIC,
                 MediaRecorder.AudioSource.DEFAULT
             )

             for (source in audioSources) {
                 try {
                     audioRecord = AudioRecord(source, SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT, bufferSize)
                     if (audioRecord?.state == AudioRecord.STATE_INITIALIZED) {
                         Log.d(TAG, "AudioRecord initialized with source: $source")
                         break
                     } else {
                         Log.w(TAG, "AudioRecord failed to init with source $source, trying next")
                         audioRecord?.release()
                         audioRecord = null
                     }
                 } catch (e: Exception) {
                     Log.w(TAG, "AudioRecord source $source threw: \${e.message}")
                     audioRecord?.release()
                     audioRecord = null
                 }
             }

             if (audioRecord == null || audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                 Log.e(TAG, "AudioRecord failed to initialize with any audio source")
                 audioRecord?.release()
                 audioRecord = null
                 return null
             }
         } catch (e: SecurityException) {
             Log.e(TAG, "RECORD_AUDIO permission not granted", e)
             return null
         }

        recordedAudio.reset()
        hasSpeechStarted = false
        lastSpeechTime = System.currentTimeMillis()
        recordingStartTime = System.currentTimeMillis()

        audioRecord?.startRecording()
        Log.d(TAG, "Started recording caller voice")

        val buffer = ShortArray(bufferSize / 2)
        var silenceStartTime = System.currentTimeMillis()

        try {
            while (isRunning) {
                val readCount = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                if (readCount <= 0) {
                    Thread.sleep(10)
                    continue
                }

                // Write raw PCM to buffer
                val byteBuffer = ByteArray(readCount * 2)
                for (i in 0 until readCount) {
                    byteBuffer[i * 2] = (buffer[i].toInt() and 0xFF).toByte()
                    byteBuffer[i * 2 + 1] = (buffer[i].toInt() shr 8 and 0xFF).toByte()
                }
                recordedAudio.write(byteBuffer, 0, byteBuffer.size)

                // Calculate RMS for silence detection
                val rms = calculateRMS(buffer, readCount)

                val now = System.currentTimeMillis()

                if (rms > SILENCE_THRESHOLD_RMS) {
                    // Speech detected
                    if (!hasSpeechStarted) {
                        hasSpeechStarted = true
                        Log.d(TAG, "Speech started (RMS: $rms)")
                    }
                    lastSpeechTime = now
                    silenceStartTime = now
                } else if (hasSpeechStarted) {
                    // Silence after speech
                    val silenceDuration = now - silenceStartTime
                    if (silenceDuration >= SILENCE_DURATION_MS) {
                        Log.d(TAG, "Silence detected for \${silenceDuration}ms, stopping recording")
                        break
                    }
                }

                // Check max recording duration
                if (now - recordingStartTime > MAX_RECORD_DURATION_MS) {
                    Log.d(TAG, "Max recording duration reached")
                    break
                }

                // If no speech after 10 seconds, return null to restart
                if (!hasSpeechStarted && (now - recordingStartTime > 10000)) {
                    Log.d(TAG, "No speech detected for 10s, restarting listen")
                    stopRecording()
                    return null
                }
            }
        } finally {
            stopRecording()
        }

        if (!hasSpeechStarted) return null

        val speechDuration = lastSpeechTime - recordingStartTime
        if (speechDuration < MIN_SPEECH_DURATION_MS) {
            Log.d(TAG, "Speech too short (\${speechDuration}ms), ignoring")
            return null
        }

        return recordedAudio.toByteArray()
    }

    private fun calculateRMS(buffer: ShortArray, length: Int): Double {
        var sum = 0.0
        for (i in 0 until length) {
            sum += buffer[i].toDouble() * buffer[i].toDouble()
        }
        return sqrt(sum / length)
    }

    private fun stopRecording() {
        try {
            audioRecord?.stop()
        } catch (e: Exception) {
            // Ignore
        }
        try {
            audioRecord?.release()
        } catch (e: Exception) {
            // Ignore
        }
        audioRecord = null
    }

    // ===================== STT (Speech-to-Text) =====================

    private fun sendToSTT(audioData: ByteArray): String? {
        try {
            // Build WAV from raw PCM
            val wavData = buildWav(audioData, SAMPLE_RATE, 1, 16)

            // Call Deepgram directly
            val url = URL(DEEPGRAM_STT_URL)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "audio/wav")
            conn.setRequestProperty("Authorization", "Token $deepgramApiKey")
            conn.connectTimeout = 10000
            conn.readTimeout = 30000

            conn.outputStream.use { it.write(wavData) }

            if (conn.responseCode != 200) {
                val errorBody = try { conn.errorStream?.bufferedReader()?.readText() } catch (e: Exception) { "unknown" }
                Log.e(TAG, "Deepgram STT failed: \${conn.responseCode} - $errorBody")
                conn.disconnect()
                return null
            }

            val responseBody = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            // Parse Deepgram response
            val jsonResponse = org.json.JSONObject(responseBody)
            val transcript = jsonResponse
                .optJSONObject("results")
                ?.optJSONArray("channels")
                ?.optJSONObject(0)
                ?.optJSONArray("alternatives")
                ?.optJSONObject(0)
                ?.optString("transcript", "") ?: ""

            Log.d(TAG, "Deepgram transcript: $transcript")
            return transcript.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            Log.e(TAG, "STT error", e)
            return null
        }
    }

    private fun buildWav(pcmData: ByteArray, sampleRate: Int, channels: Int, bitsPerSample: Int): ByteArray {
        val dataSize = pcmData.size
        val headerSize = 44
        val totalSize = headerSize + dataSize
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8

        val wav = ByteArray(totalSize)

        // RIFF header
        wav[0] = 'R'.code.toByte(); wav[1] = 'I'.code.toByte()
        wav[2] = 'F'.code.toByte(); wav[3] = 'F'.code.toByte()
        writeInt32LE(wav, 4, totalSize - 8)
        wav[8] = 'W'.code.toByte(); wav[9] = 'A'.code.toByte()
        wav[10] = 'V'.code.toByte(); wav[11] = 'E'.code.toByte()

        // fmt chunk
        wav[12] = 'f'.code.toByte(); wav[13] = 'm'.code.toByte()
        wav[14] = 't'.code.toByte(); wav[15] = ' '.code.toByte()
        writeInt32LE(wav, 16, 16) // chunk size
        writeInt16LE(wav, 20, 1)  // PCM format
        writeInt16LE(wav, 22, channels)
        writeInt32LE(wav, 24, sampleRate)
        writeInt32LE(wav, 28, byteRate)
        writeInt16LE(wav, 32, blockAlign)
        writeInt16LE(wav, 34, bitsPerSample)

        // data chunk
        wav[36] = 'd'.code.toByte(); wav[37] = 'a'.code.toByte()
        wav[38] = 't'.code.toByte(); wav[39] = 'a'.code.toByte()
        writeInt32LE(wav, 40, dataSize)

        System.arraycopy(pcmData, 0, wav, 44, dataSize)
        return wav
    }

    private fun writeInt32LE(buf: ByteArray, offset: Int, value: Int) {
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = (value shr 8 and 0xFF).toByte()
        buf[offset + 2] = (value shr 16 and 0xFF).toByte()
        buf[offset + 3] = (value shr 24 and 0xFF).toByte()
    }

    private fun writeInt16LE(buf: ByteArray, offset: Int, value: Int) {
        buf[offset] = (value and 0xFF).toByte()
        buf[offset + 1] = (value shr 8 and 0xFF).toByte()
    }

    // ===================== TTS PLAYBACK =====================

    private fun playTTSResponse(text: String): Boolean {
        try {
            val audioBytes = fetchElevenLabsTTS(text)

            if (audioBytes == null || audioBytes.isEmpty()) {
                Log.w(TAG, "No TTS audio received")
                return false
            }

            playAudioToCall(audioBytes)
            return true
        } catch (e: Exception) {
            Log.e(TAG, "TTS playback error", e)
            return false
        }
    }

    private fun fetchElevenLabsTTS(text: String): ByteArray? {
        try {
            // Call ElevenLabs API directly — request raw PCM at 16kHz to match our AudioTrack
            val url = URL("$ELEVENLABS_TTS_URL$elevenLabsVoiceId?output_format=pcm_16000")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("xi-api-key", elevenLabsApiKey)
            conn.connectTimeout = 15000
            conn.readTimeout = 30000

            val json = org.json.JSONObject()
            json.put("text", text)
            json.put("model_id", "eleven_multilingual_v2")
            val voiceSettings = org.json.JSONObject()
            voiceSettings.put("stability", 0.5)
            voiceSettings.put("similarity_boost", 0.75)
            voiceSettings.put("style", 0.3)
            voiceSettings.put("use_speaker_boost", true)
            json.put("voice_settings", voiceSettings)

            conn.outputStream.use { it.write(json.toString().toByteArray(Charsets.UTF_8)) }

            if (conn.responseCode != 200) {
                val errorBody = try { conn.errorStream?.bufferedReader()?.readText() } catch (e: Exception) { "unknown" }
                Log.w(TAG, "ElevenLabs TTS failed: \${conn.responseCode} - $errorBody")
                conn.disconnect()
                return null
            }

            val audioBytes = conn.inputStream.readBytes()
            conn.disconnect()
            Log.d(TAG, "ElevenLabs TTS received \${audioBytes.size} bytes (raw PCM 16kHz)")
            return audioBytes
        } catch (e: Exception) {
            Log.w(TAG, "ElevenLabs TTS error: \${e.message}")
            return null
        }
    }

    /**
      * Plays audio bytes to the call using AudioTrack with USAGE_VOICE_COMMUNICATION.
      * This routes the audio through the telephony audio path so the remote caller hears it.
      *
      * Since we request pcm_16000 from ElevenLabs, audioBytes is already raw PCM 16kHz mono 16-bit.
      * For other formats (WAV, MP3), we decode first.
      */
     private fun playAudioToCall(audioBytes: ByteArray) {
         try {
             val pcmData = decodeAudioToPCM(audioBytes)
             if (pcmData == null || pcmData.isEmpty()) {
                 Log.w(TAG, "Failed to decode audio to PCM, size=\${audioBytes.size}")
                 return
             }

             Log.d(TAG, "Playing \${pcmData.size} bytes of PCM audio to call")

             val audioAttributes = AudioAttributes.Builder()
                 .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                 .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                 .build()

             val audioFormat = AudioFormat.Builder()
                 .setSampleRate(SAMPLE_RATE)
                 .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                 .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                 .build()

             val minBuffer = AudioTrack.getMinBufferSize(
                 SAMPLE_RATE,
                 AudioFormat.CHANNEL_OUT_MONO,
                 AudioFormat.ENCODING_PCM_16BIT
             )

             // Use MODE_STREAM instead of MODE_STATIC — more reliable for large audio buffers
             audioTrack = AudioTrack.Builder()
                 .setAudioAttributes(audioAttributes)
                 .setAudioFormat(audioFormat)
                 .setBufferSizeInBytes(maxOf(minBuffer * 2, 4096))
                 .setTransferMode(AudioTrack.MODE_STREAM)
                 .build()

             if (audioTrack?.state != AudioTrack.STATE_INITIALIZED) {
                 Log.e(TAG, "AudioTrack failed to initialize")
                 stopPlayback()
                 return
             }

             audioTrack?.play()

             // Write in chunks for MODE_STREAM
             var offset = 0
             val chunkSize = minBuffer
             while (offset < pcmData.size && isRunning) {
                 val remaining = pcmData.size - offset
                 val writeSize = minOf(chunkSize, remaining)
                 val written = audioTrack?.write(pcmData, offset, writeSize) ?: -1
                 if (written < 0) {
                     Log.e(TAG, "AudioTrack write error: $written")
                     break
                 }
                 offset += written
             }

             // Wait for the last chunk to finish playing
             val durationMs = (pcmData.size.toLong() * 1000) / (SAMPLE_RATE * 2)
             val remainingMs = durationMs - (offset.toLong() * 1000) / (SAMPLE_RATE * 2)
             if (remainingMs > 0) {
                 Thread.sleep(remainingMs + 300)
             } else {
                 Thread.sleep(500) // Small buffer to ensure playback completes
             }

             stopPlayback()
         } catch (e: Exception) {
             Log.e(TAG, "Audio playback error: \${e.message}", e)
             stopPlayback()
         }
     }

    /**
      * Decodes audio bytes into raw PCM 16kHz mono 16-bit.
      * Handles: raw PCM (from ElevenLabs pcm_16000), WAV, MP3, OGG.
      */
     private fun decodeAudioToPCM(audioBytes: ByteArray): ByteArray? {
         try {
             if (audioBytes.isEmpty()) return null

             // Detect format by magic bytes
             val isWav = audioBytes.size > 44 &&
                 audioBytes[0] == 'R'.code.toByte() && audioBytes[1] == 'I'.code.toByte() &&
                 audioBytes[2] == 'F'.code.toByte() && audioBytes[3] == 'F'.code.toByte()

             val isMp3 = audioBytes.size > 2 &&
                 (audioBytes[0].toInt() and 0xFF) == 0xFF &&
                 (audioBytes[1].toInt() and 0xE0) == 0xE0

             val isOgg = audioBytes.size > 4 &&
                 audioBytes[0] == 'O'.code.toByte() && audioBytes[1] == 'g'.code.toByte() &&
                 audioBytes[2] == 'g'.code.toByte() && audioBytes[3] == 'S'.code.toByte()

             if (isWav) {
                 Log.d(TAG, "Detected WAV format, extracting PCM data")
                 val pcm = audioBytes.copyOfRange(44, audioBytes.size)
                 return pcm
             }

             if (!isMp3 && !isOgg) {
                 // No recognized header — assume raw PCM (ElevenLabs pcm_16000 output)
                 Log.d(TAG, "No audio header detected, treating as raw PCM 16kHz (\${audioBytes.size} bytes)")
                 return audioBytes
             }

             // For MP3/OGG, use MediaCodec to decode
             Log.d(TAG, "Detected encoded audio format, decoding via MediaCodec")
             val tempFile = java.io.File(context.cacheDir, "tts_temp_\${System.currentTimeMillis()}.audio")
             tempFile.writeBytes(audioBytes)

             try {
                 val extractor = MediaExtractor()
                 extractor.setDataSource(tempFile.absolutePath)

                 if (extractor.trackCount == 0) {
                     Log.w(TAG, "MediaExtractor found no tracks")
                     extractor.release()
                     // Fall back to treating as raw PCM
                     return audioBytes
                 }

                 extractor.selectTrack(0)
                 val format = extractor.getTrackFormat(0)
                 val mime = format.getString(MediaFormat.KEY_MIME)
                 if (mime == null) {
                     extractor.release()
                     return audioBytes
                 }

                 Log.d(TAG, "Decoding audio: mime=$mime")
                 val codec = MediaCodec.createDecoderByType(mime)
                 codec.configure(format, null, null, 0)
                 codec.start()

                 val output = ByteArrayOutputStream()
                 val bufferInfo = MediaCodec.BufferInfo()
                 var inputDone = false
                 var outputDone = false

                 while (!outputDone && isRunning) {
                     // Feed input
                     if (!inputDone) {
                         val inputIdx = codec.dequeueInputBuffer(10000)
                         if (inputIdx >= 0) {
                             val inputBuffer = codec.getInputBuffer(inputIdx)!!
                             val sampleSize = extractor.readSampleData(inputBuffer, 0)
                             if (sampleSize < 0) {
                                 codec.queueInputBuffer(inputIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                 inputDone = true
                             } else {
                                 codec.queueInputBuffer(inputIdx, 0, sampleSize, extractor.sampleTime, 0)
                                 extractor.advance()
                             }
                         }
                     }

                     // Drain output
                     val outputIdx = codec.dequeueOutputBuffer(bufferInfo, 10000)
                     if (outputIdx >= 0) {
                         val outputBuffer = codec.getOutputBuffer(outputIdx)!!
                         val pcmChunk = ByteArray(bufferInfo.size)
                         outputBuffer.get(pcmChunk)
                         output.write(pcmChunk)
                         codec.releaseOutputBuffer(outputIdx, false)

                         if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                             outputDone = true
                         }
                     }
                 }

                 codec.stop()
                 codec.release()
                 extractor.release()

                 val decoded = output.toByteArray()
                 Log.d(TAG, "Decoded \${audioBytes.size} bytes -> \${decoded.size} bytes PCM")
                 return decoded
             } finally {
                 tempFile.delete()
             }
         } catch (e: Exception) {
             Log.e(TAG, "Audio decode error: \${e.message}", e)
             // Last resort: return raw bytes and hope for the best
             return audioBytes
         }
     }

    private fun stopPlayback() {
        try {
            audioTrack?.stop()
        } catch (e: Exception) { /* ignore */ }
        try {
            audioTrack?.release()
        } catch (e: Exception) { /* ignore */ }
        audioTrack = null
    }

    // ===================== AI RESPONSE WAITING =====================

    private fun waitForAIResponse(timeoutMs: Long): String? {
        synchronized(aiResponseLock) {
            pendingAIResponse = null
            val deadline = System.currentTimeMillis() + timeoutMs
            while (pendingAIResponse == null && isRunning) {
                val remaining = deadline - System.currentTimeMillis()
                if (remaining <= 0) break
                try {
                    aiResponseLock.wait(remaining)
                } catch (e: InterruptedException) {
                    break
                }
            }
            val response = pendingAIResponse
            pendingAIResponse = null
            return response
        }
    }

    // ===================== EVENTS =====================

    private fun emitEvent(eventName: String, data: Map<String, String>) {
        try {
            eventCallback(eventName, data)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to emit event $eventName: \${e.message}")
        }
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
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import ${packageName}.service.AIInCallService
import ${packageName}.service.AudioBridge

class AICallModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    companion object {
        private const val TAG = "AICallModule"
        private var sharedContext: ReactApplicationContext? = null

        fun init(context: ReactApplicationContext) {
            sharedContext = context
        }

        fun sendEvent(eventName: String, params: Map<String, String>) {
            val ctx = sharedContext ?: return
            try {
                val map = Arguments.createMap()
                params.forEach { (key, value) -> map.putString(key, value) }
                ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(eventName, map)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send event $eventName: \${e.message}")
            }
        }
    }

    override fun getName() = "AICallModule"

    // ==================== Call Control ====================

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

    // ==================== AI Conversation Control ====================

    @ReactMethod
    fun supplyAIResponse(response: String, promise: Promise) {
        try {
            val bridge = AIInCallService.instance?.getAudioBridge()
            if (bridge != null) {
                bridge.supplyAIResponse(response)
                promise.resolve(true)
            } else {
                promise.reject("ERROR", "No active audio bridge")
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopAI(promise: Promise) {
        try {
            AIInCallService.instance?.stopAI()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getCallTranscript(promise: Promise) {
        try {
            val bridge = AIInCallService.instance?.getAudioBridge()
            if (bridge != null) {
                val transcript = bridge.getTranscript()
                val result = Arguments.createArray()
                transcript.forEach { entry ->
                    val map = Arguments.createMap()
                    entry.forEach { (k, v) -> map.putString(k, v) }
                    result.pushMap(map)
                }
                promise.resolve(result)
            } else {
                promise.resolve(Arguments.createArray())
            }
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun setProxyBaseUrl(url: String, promise: Promise) {
        AudioBridge.proxyBaseUrl = url
        promise.resolve(true)
    }

    @ReactMethod
    fun setApiKeys(deepgramKey: String, elevenLabsKey: String, nvidiaKey: String, promise: Promise) {
        if (deepgramKey.isNotBlank()) AudioBridge.deepgramApiKey = deepgramKey
        if (elevenLabsKey.isNotBlank()) AudioBridge.elevenLabsApiKey = elevenLabsKey
        if (nvidiaKey.isNotBlank()) AudioBridge.nvidiaApiKey = nvidiaKey
        Log.d(TAG, "API keys updated")
        promise.resolve(true)
    }

    @ReactMethod
    fun setVoiceConfig(voiceId: String, model: String, promise: Promise) {
        if (voiceId.isNotBlank()) AudioBridge.elevenLabsVoiceId = voiceId
        if (model.isNotBlank()) AudioBridge.aiModel = model
        Log.d(TAG, "Voice config updated: voice=$voiceId model=$model")
        promise.resolve(true)
    }

    // ==================== Permissions ====================

    @ReactMethod
    fun checkPermissions(promise: Promise) {
        val activity = ctx.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        val permissions = arrayOf(
            Manifest.permission.ANSWER_PHONE_CALLS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.RECORD_AUDIO,
        )
        val allGranted = permissions.all {
            ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
        }
        promise.resolve(allGranted)
    }

    @ReactMethod
    fun checkDefaultDialer(promise: Promise) {
        try {
            val telecomManager = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            promise.resolve(telecomManager.defaultDialerPackage == ctx.packageName)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPermissions(promise: Promise) {
        val activity = ctx.currentActivity
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
        val activity = ctx.currentActivity
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

    // ==================== On-Device Speech Recognition ====================

    private var speechRecognizer: android.speech.SpeechRecognizer? = null

    @ReactMethod
    fun startListening(language: String, promise: Promise) {
        val activity = ctx.currentActivity
        if (activity == null) {
            promise.reject("ERROR", "No activity")
            return
        }

        activity.runOnUiThread {
            try {
                speechRecognizer?.destroy()
                speechRecognizer = android.speech.SpeechRecognizer.createSpeechRecognizer(activity)

                val intent = android.content.Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, language)
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1)

                speechRecognizer?.setRecognitionListener(object : android.speech.RecognitionListener {
                    override fun onResults(results: android.os.Bundle?) {
                        val matches = results?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)
                        val text = matches?.firstOrNull() ?: ""
                        sendEvent("onSpeechResult", mapOf("text" to text, "isFinal" to "true"))
                    }

                    override fun onPartialResults(partialResults: android.os.Bundle?) {
                        val matches = partialResults?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)
                        val text = matches?.firstOrNull() ?: ""
                        if (text.isNotEmpty()) {
                            sendEvent("onSpeechResult", mapOf("text" to text, "isFinal" to "false"))
                        }
                    }

                    override fun onError(error: Int) {
                        val errorMsg = when (error) {
                            android.speech.SpeechRecognizer.ERROR_NO_MATCH -> "No speech detected"
                            android.speech.SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                            android.speech.SpeechRecognizer.ERROR_AUDIO -> "Audio error"
                            else -> "Speech error: \\$error"
                        }
                        sendEvent("onSpeechError", mapOf("error" to errorMsg))
                    }

                    override fun onReadyForSpeech(params: android.os.Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
                })

                speechRecognizer?.startListening(intent)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun stopListening(promise: Promise) {
        try {
            speechRecognizer?.stopListening()
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

    init {
        init(ctx)
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
