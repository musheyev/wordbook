// The Express application, with no server binding.
// This module is shared by two entry points:
//   - server.js  -> runs it locally with app.listen (unchanged dev workflow)
//   - lambda.js  -> wraps it for AWS Lambda via serverless-http
// dotenv is loaded here (first) so routers that read process.env at require-time
// (authRouter, wordnik, word-pictures) see the values. In Lambda there is no
// .env file, so dotenv.config() simply no-ops and the platform env vars are used.
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { refreshSession } = require("./session");

const rootRouter = require("./routes/rootRouter");
const dictionaryRouter = require("./routes/dictionaryRouter");
const authRouter = require("./routes/authRouter");
const wordbookRouter = require("./routes/wordbookRouter");
const usersRouter = require("./routes/usersRouter");
const adminsRouter = require("./routes/adminsRouter");

const app = express();

// Middleware chain. Every request passes through these app.use() handlers in
// the order they're registered, each doing one job and calling next(), before
// it reaches a router below. Order matters: a handler can only use what the
// ones before it have set up.
app.use(helmet());                                // security-related response headers
app.use(express.static("public"));                // serve files in public/ as-is
app.use(express.urlencoded({ extended: true }));  // parse HTML form bodies into req.body
app.use(express.json());                          // parse JSON bodies into req.body
app.use(cookieParser());                          // parse the Cookie header into req.cookies
// Renew an expired login from the refresh token before any route reads it.
// Must come after cookieParser (it reads req.cookies) and before the routers
// (so they see the renewed id_token). See session.js.
app.use(refreshSession);
app.use(cors());                                  // allow cross-origin requests

app.set("view engine", "ejs");

// Routers: each handles every path under its prefix, e.g. /wordbook/list.
app.use("/", rootRouter);
app.use("/dictionary", dictionaryRouter);
app.use("/wordbook", wordbookRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/admins", adminsRouter);

module.exports = app;
