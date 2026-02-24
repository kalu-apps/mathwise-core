export const toTimestamp = (date: string, time: string): number => {
  if (!date || !time) return Number.NaN;
  return new Date(`${date}T${time}`).getTime();
};

export const getBookingStartTimestamp = (booking: {
  date: string;
  startTime: string;
}): number => toTimestamp(booking.date, booking.startTime);

export const getBookingEndTimestamp = (booking: {
  date: string;
  startTime: string;
  endTime: string;
}): number => {
  const end = toTimestamp(booking.date, booking.endTime);
  if (Number.isFinite(end)) return end;
  return getBookingStartTimestamp(booking);
};

export const isBookingCompleted = (
  booking: { date: string; startTime: string; endTime: string },
  now = Date.now()
): boolean => {
  const end = getBookingEndTimestamp(booking);
  return Number.isFinite(end) && end < now;
};
