import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

// Manual redirect instead of auth.protect() — the latter returns a bare 404 for
// unauthenticated page requests in some cases on Next.js 16's proxy runtime
// (see https://github.com/clerk/javascript/issues/8302), which read as the page
// not existing rather than "please sign in." API routes are excluded since they
// already do their own auth() check and return a proper 401 JSON body.
export default clerkMiddleware(async (auth, req) => {
  if (isApiRoute(req)) return;
  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
