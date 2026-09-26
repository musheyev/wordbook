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

app.use(helmet());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
// Renew an expired login from the refresh token before any route reads it.
app.use(refreshSession);
app.use(cors());

app.set("view engine", "ejs");

app.use("/", rootRouter);
app.use("/dictionary", dictionaryRouter);
app.use("/wordbook", wordbookRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/admins", adminsRouter);

module.exports = app;
