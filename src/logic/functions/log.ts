/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import type { HttpLog } from "../typing/functions/log.typing.js";

export function logger(httpLog: HttpLog) {
  Object.keys(httpLog).forEach((key) => {
    const keyName = key as keyof typeof httpLog;
    const value: any = httpLog[keyName];

    if (keyName === "request") {
      const headers = Object.fromEntries(value.headers.entries());

      console.log("%cHEADERS:", "color: #00b894; font-weight: bold;", headers);
      console.log("%cBODY:", "color: #00b894; font-weight: bold;", value.body);
      console.log("%cMETHOD:", "color: #00b894; font-weight: bold;", value.method);
    } else {

      const keyLog = keyName === "url" ? "endpoint" : `${keyName}`;
      console.log(`%c${keyLog.toUpperCase()}:`, "color: #00b894; font-weight: bold;", value);
    }
  });
}
