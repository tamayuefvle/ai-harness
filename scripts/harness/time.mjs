export function resolvedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function utcTimestamp(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("A valid Date is required.");
  }
  return date.toISOString();
}

export function localCalendarParts(date = new Date(), timeZone = resolvedTimeZone()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("A valid Date is required.");
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    month: `${values.year}-${values.month}`,
    time: `${values.hour}:${values.minute}:${values.second}`,
    timeZone,
  };
}

export function localDate(date = new Date(), timeZone = resolvedTimeZone()) {
  return localCalendarParts(date, timeZone).date;
}

export function localMonth(date = new Date(), timeZone = resolvedTimeZone()) {
  return localCalendarParts(date, timeZone).month;
}
