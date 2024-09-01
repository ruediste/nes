export function createRange<T>(
  length: number,
  initializer: (index: number) => T
): T[] {
  return [...new Array(length)].map((_, index) => initializer(index));
}

export function checkType<T>(arg: T): T {
  return arg;
}

export function debounce<TArgs extends any[]>(
  callback: (...args: TArgs) => void,
  wait: number
): (...args: TArgs) => void {
  let timeoutId: number | null = null;
  return (...args: TArgs) => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      callback(...args);
    }, wait);
  };
}

export function zip<T>(a: T[], b: T[]): [T, T][] {
  return a.map((v, i) => [v, b[i]]);
}

function mostSignificantDigit(value: number) {
  return Math.floor(Math.log10(value)) + 1;
}

function roundingFactor(value: number, precision: number) {
  const log = mostSignificantDigit(value);
  const shift = log - precision;
  return [Math.pow(10, -shift), shift];
}

export function trimTrailingZeros(value: string) {
  return value.replace(/\.?0+$/, "");
}

export function formatToPrecision(value: number, precision: number): string {
  if (value < 0) return "-" + formatToPrecision(-value, precision);
  if (value === 0) return "0";

  const [factor, shift] = roundingFactor(value, precision);
  const rounded = Math.round(value * factor).toString();
  const digitsBeforeComma = rounded.split(".")[0].length;
  const leadingDigitPosition = digitsBeforeComma + shift;

  if (leadingDigitPosition - precision > 3 || leadingDigitPosition < -3) {
    return (
      rounded.slice(0, 1) +
      trimTrailingZeros("." + rounded.slice(1)) +
      "e" +
      (leadingDigitPosition - 1)
    );
  }
  if (shift > 0) {
    return rounded + "0".repeat(shift);
  }
  if (shift === 0) return rounded;
  if (leadingDigitPosition > 0)
    return (
      rounded.slice(0, leadingDigitPosition) +
      trimTrailingZeros("." + rounded.slice(leadingDigitPosition))
    );
  return (
    "0" + trimTrailingZeros("." + "0".repeat(-leadingDigitPosition) + rounded)
  );
}
