export interface DiarizedSegment {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

export function renderLabeledTranscript(
  segments: DiarizedSegment[],
  speakerMap: Record<string, string>,
): string {
  if (!segments.length) return '';

  const lines: string[] = [];
  let currentSpeaker: string | null = null;
  let currentTexts: string[] = [];

  const flush = () => {
    if (currentSpeaker !== null && currentTexts.length) {
      const label = speakerMap[currentSpeaker] ?? currentSpeaker;
      lines.push(`[${label}] ${currentTexts.join(' ')}`);
    }
  };

  for (const seg of segments) {
    if (seg.speaker !== currentSpeaker) {
      flush();
      currentSpeaker = seg.speaker;
      currentTexts = [seg.text];
    } else {
      currentTexts.push(seg.text);
    }
  }
  flush();

  return lines.join('\n');
}
