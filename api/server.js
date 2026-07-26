// Local entry point. Runs the Express app as a normal Node server on port 4000,
// exactly like before. Used for `npm run dev` / `npm start` during development.
const app = require("./app");
const log = require("./logger");

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  log(`Server started on port ${PORT}`);
});
