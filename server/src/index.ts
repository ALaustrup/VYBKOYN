import cors from "cors";
import express from "express";
import helmet from "helmet";
import { authRouter } from "./routes/auth.js";
import { gameRouter } from "./routes/game.js";
import { leaderboardRouter } from "./routes/leaderboard.js";
import { shopRouter } from "./routes/shop.js";
import { clientVersionRouter } from "./routes/clientVersion.js";
import { claimRouter } from "./routes/claim.js";
import { requireAuth, type AuthedRequest } from "./middleware/auth.js";
import { resolveCorsOrigin } from "./lib/cors.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(helmet());
app.use(cors({ origin: resolveCorsOrigin(), credentials: true }));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRouter);
app.use("/client", clientVersionRouter);
app.use("/claim", claimRouter);
app.use("/leaderboard", leaderboardRouter);

app.use("/game", requireAuth as express.RequestHandler, gameRouter as express.RequestHandler);
app.use("/shop", requireAuth as express.RequestHandler, shopRouter as express.RequestHandler);

app.use((err: unknown, _req: AuthedRequest, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(port, () => {
  console.log(`KOYN server listening on :${port}`);
});
