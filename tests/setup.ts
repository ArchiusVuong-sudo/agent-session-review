// Unit tests never reach the network: replay mode, instant replays, scratch data.
if (process.env.LIVE !== "1") process.env.DEMO_REPLAY = "1";
process.env.REPLAY_DELAY_MS = "0";
