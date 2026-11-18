const EVENT_TIME_ZONE = 'Europe/Oslo';

function localDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}`;
}

function eventDate(date: string | undefined): string | undefined {
  const value = date?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  const parsed = value ? new Date(`${value}T00:00:00Z`) : undefined;
  if (!value || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return undefined;
  return value;
}

function endTime(time: string | undefined): string | undefined {
  const match = time?.match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
  if (!match) return undefined;
  const [startHour, startMinute, hour, minute] = match.slice(1).map(Number);
  if (startHour > 23 || startMinute > 59 || hour > 23 || minute > 59) return undefined;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function eventHasEnded(endDate: string | undefined, time: string | undefined, now = new Date()): boolean {
  const date = eventDate(endDate);
  if (!date) return false;

  const localNow = localDateTime(now);
  const finishTime = endTime(time);
  return finishTime ? localNow >= `${date}T${finishTime}` : localNow.slice(0, 10) > date;
}
