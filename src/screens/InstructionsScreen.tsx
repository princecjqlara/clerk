// This screen is replaced by TenantConfigScreen which has tabs for Rules, Knowledge, Flow
// Kept as a thin redirect wrapper for backward compatibility with navigation
import React from 'react';
import TenantConfigScreen from './TenantConfigScreen';

interface Props {
  onBack: () => void;
}

export default function InstructionsScreen({ onBack }: Props) {
  return <TenantConfigScreen onBack={onBack} />;
}
