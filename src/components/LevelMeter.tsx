interface LevelMeterProps {
  level: number;
}

export function LevelMeter({ level }: LevelMeterProps) {
  const levelPercent = `${Math.round(level * 100)}%`;

  return (
    <div aria-label="Output level" aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.round(level * 100)} className="meter" role="meter">
      <span className="meter__bar" style={{ inlineSize: levelPercent }} />
    </div>
  );
}
