import { HttpLog } from "../typing/functions/log";

export function logger<T>(httpLog: HttpLog<T>) {
  Object.keys(httpLog).forEach((key) => {
    const keyName = key as keyof typeof httpLog;
    const value = httpLog[keyName];

    if (keyName === "request") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headers = Object.fromEntries(((value) as any).headers.entries());
      // eslint-disable-next-line no-console
      console.log(`%c${keyName}:`, "color: #00b894; font-weight: bold;", value);
      // eslint-disable-next-line no-console
      console.log("%cheaders:", "color: #00b894; font-weight: bold;", headers);
    } else {
      // eslint-disable-next-line no-console
      console.log(`%c${keyName === "url" ? "endpoint" : keyName}:`, "color: #00b894; font-weight: bold;", value);
    }
  });
}
