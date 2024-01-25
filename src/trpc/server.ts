import "server-only";

import { createTRPCProxyClient, loggerLink, TRPCClientError } from "@trpc/client";
import { callProcedure } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { type TRPCErrorResponse } from "@trpc/server/rpc";
import { headers } from "next/headers";

import { appRouter, type AppRouter } from "@/server/api/root";
import { type TRPCContext } from "@/server/api/trpc";
import { transformer } from "./shared";
import { db } from "@/server/database";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a tRPC call from a React Server Component.
 */
const createContext = (): Partial<TRPCContext> => {
  const heads = new Headers(headers());
  heads.set("x-trpc-source", "rsc");
  console.log({ heads });

  return {
    db,
    headers: heads,
  };
};

export const api = createTRPCProxyClient<AppRouter>({
  transformer,
  links: [
    loggerLink({
      enabled: (op) =>
        process.env.NODE_ENV === "development" ||
        (op.direction === "down" && op.result instanceof Error),
    }),
    /**
     * Custom RSC link that lets us invoke procedures without using http requests. Since Server
     * Components always run on the server, we can just call the procedure as a function.
     */
    () =>
      ({ op }) =>
        observable((observer) => {
          const context = createContext();

          callProcedure({
            procedures: appRouter._def.procedures,
            path: op.path,
            rawInput: op.input,
            ctx: context,
            type: op.type,
          })
            .then((data) => {
              observer.next({ result: { data } });
              observer.complete();
            })
            .catch((cause: TRPCErrorResponse) => {
              observer.error(TRPCClientError.from(cause));
            });
        }),
  ],
});