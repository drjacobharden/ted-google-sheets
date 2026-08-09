type DateFormat = {
  showDays: boolean;
  showMonth: boolean;
  monthFormat: "short" | "long";
};
export type DateRange = { start: Date; end: Date };
export type DatePickerStep = "week" | "month" | "year";

function createDateUtilities() {
  const today = new Date();
  const defaultRange = {
    start: startOfYear(today),
    end: endOfYear(today),
  };

  //   Returns January 1st of the year of the provided date
  function startOfYear(date: Date): Date {
    const _date = new Date(date);

    _date.setFullYear(date.getFullYear(), 0, 1);
    _date.setHours(0, 0, 0, 0);

    return _date;
  }

  //   Returns December 31st of the year of the provided date
  function endOfYear(date: Date): Date {
    const _date = new Date(date);
    const year = _date.getFullYear();

    _date.setFullYear(year + 1, 0, 0);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  //   Returns the 1st of the month for the provided date
  function startOfMonth(date: Date): Date {
    const _date = new Date(date);
    _date.setDate(1);
    _date.setHours(0, 0, 0, 0);
    return date;
  }

  //   Returns the last day of the month for the provided date
  function endOfMonth(date: Date): Date {
    const _date = new Date(date);
    const month = _date.getMonth();
    _date.setFullYear(_date.getFullYear(), month + 1, 0);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  //   Returns the Sunday of the week for the provided date
  function startOfWeek(date: Date): Date {
    const _date = new Date(date);
    const dayOfWeek = _date.getDay();
    _date.setDate(date.getDate() - dayOfWeek);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  //   Returns the Saturday of the week for the provided date
  function endOfWeek(date: Date): Date {
    const _date = new Date(date);
    const dayOfWeek = _date.getDay();

    _date.setDate(date.getDate() + 6 - dayOfWeek);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  //   Adds the specified number of years to the provided date
  function addYears(date: Date, amount: number) {
    const _date = new Date(date);
    _date.setFullYear(_date.getFullYear() + amount);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  //   Removes the specified number of years from the provided date
  function subYears(date: Date, amount: number) {
    return addYears(date, -amount);
  }

  //   Adds the specified number of months to the provided date
  function addMonths(date: Date, amount: number) {
    const _date = new Date(date);
    _date.setMonth(_date.getMonth() + amount);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  //   Removes the specified number of months from the provided date
  function subMonths(date: Date, amount: number) {
    return addMonths(date, -amount);
  }

  //   Adds the specified number of weeks to the provided date
  function addWeeks(date: Date, amount: number) {
    return addDays(date, amount * 7);
  }

  //   Removes the specified number of weeks from the provided date
  function subWeeks(date: Date, amount: number) {
    return addWeeks(date, -amount);
  }

  //   Adds the specified number of days to the provided date
  function addDays(date: Date, amount: number) {
    const _date = new Date(date);
    _date.setDate(_date.getDate() + amount);
    _date.setHours(0, 0, 0, 0);
    return _date;
  }

  //   Removes the specified number of days from the provided date
  function subDays(date: Date, amount: number) {
    return addDays(date, -amount);
  }

  function toISODate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  //    Returns the date formatted as YYYY-MM-DD, ensuring timezone doesn't affect
  function toDateId(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  //    Converts a date ID to a `Date` object, correctly accounting for timezone.
  function fromDateId(dateId: string) {
    const [year, month, day] = dateId.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function isInRange(date: Date | string, range: DateRange): boolean {
    const { start, end } = range;
    const _date = typeof date === "string" ? fromDateId(date) : date;
    return _date <= end && _date >= start;
  }

  //    Is the provided date the same month as the reference date?
  function isSameMonth(date: Date, referenceDate: Date): boolean {
    const month = date.getMonth();
    const year = date.getFullYear();
    const referenceMonth = referenceDate.getMonth();
    const referenceYear = referenceDate.getFullYear();

    return referenceYear === year && referenceMonth === month;
  }

  //    Is the provided date the same week as the reference date?
  function isSameWeek(date: Date, referenceDate: Date): boolean {
    return startOfWeek(date) === startOfWeek(referenceDate);
  }

  //    Is the provided date the same year as the reference date?
  function isSameYear(date: Date, referenceDate: Date): boolean {
    return date.getFullYear() === referenceDate.getFullYear();
  }

  //    Formats a date to the "Jan 1, 2026" format
  const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  //    Formats a date to the "January 1, 2026" format
  const longDateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const createdDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const shortMonthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  //    Formats a date to the "Jan" format
  const shortMonthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });

  //    Formats a date to the "January" format
  const longMonthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
  });

  //    Formats a date to the "Jan 2026" format
  const shortMonthYearFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  //    Formats a date to the "January 2026" format
  const longMonthYearFormatter = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  //   Formats a date to the "January 1, 2026 at 10:30 AM" format
  const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function formatDateRange(
    start: Date,
    end: Date,
    format: DateFormat = {
      showDays: true,
      showMonth: true,
      monthFormat: "long",
    },
  ): string {
    let _start: string | number = "";
    let _end: string | number = "";
    let _year = start.getFullYear();
    let _separator = format.monthFormat === "long" ? "to" : "-";

    if (!format.showDays && !format.showMonth) {
      // 2026
      if (isSameYear(start, end)) {
        return `${start.getFullYear()}`;
      }
      // 2025 - 2026
      else {
        return `${start.getFullYear()} ${_separator} ${end.getFullYear()}`;
      }
    }

    if (!format.showDays) {
      // Jan 2026
      if (isSameMonth(start, end)) {
        return start.toLocaleDateString("default", {
          month: format.monthFormat,
          year: "numeric",
        });
      }
      // Jan - Mar 2026
      else if (isSameYear(start, end)) {
        _start = start.toLocaleString("default", { month: format.monthFormat });
        _end = end.toLocaleString("default", { month: format.monthFormat });
        return `${_start} ${_separator} ${end} ${_year}`;
      }
      // Dec 2025 - Jan 2026
      else {
        _start = start.toLocaleString("default", {
          month: format.monthFormat,
          year: "numeric",
        });
        _end = end.toLocaleString("default", {
          month: format.monthFormat,
          year: "numeric",
        });
        return `${start} ${_separator} ${end}`;
      }
    }

    // Dec 1, 2025 - Jan 31, 2026 or December 1, 2025 to January 31, 2026
    if (!isSameYear(start, end)) {
      _start = start.toLocaleString("default", {
        month: format.monthFormat,
        day: "numeric",
        year: "numeric",
      });
      _end = end.toLocaleString("default", {
        month: format.monthFormat,
        day: "numeric",
        year: "numeric",
      });
      return `${_start} ${_separator} ${_end}`;
    }

    // Jan 1 - Mar 31, 2026 or January 1 - March 31, 2026
    if (!isSameMonth(start, end)) {
      let _year = start.getFullYear();

      _start = start.toLocaleDateString("default", {
        month: format.monthFormat,
        day: "numeric",
      });
      _end = end.toLocaleDateString("default", {
        month: format.monthFormat,
        day: "numeric",
      });

      return `${_start} ${_separator} ${_end}, ${_year}`;
    }

    // Jan 1 - 31, 2026
    const _month = start.toLocaleDateString("default", {
      month: format.monthFormat,
    });
    _start = start.getDate();
    _end = end.getDate();
    return `${_month} ${_start} ${_separator} ${_end}, ${_year}`;
  }

  return {
    startOfYear,
    startOfMonth,
    startOfWeek,
    endOfYear,
    endOfMonth,
    endOfWeek,
    addDays,
    addWeeks,
    addMonths,
    addYears,
    subDays,
    subWeeks,
    subMonths,
    subYears,
    toDateId,
    toISODate,
    fromDateId,
    fromISODate: fromDateId,
    isSameMonth,
    isSameWeek,
    isSameYear,
    formatDateRange,
    isInRange,
    today,
    shortDateFormatter,
    longDateFormatter,
    shortMonthYearFormatter,
    longMonthYearFormatter,
    dateTimeFormatter,
    createdDateTimeFormatter,
    monthFormatter,
    shortMonthNames,
    defaultRange,
  };
}

export const DateUtils = createDateUtilities();
