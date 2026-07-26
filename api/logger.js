//logging
const timestamp = () => `[${new Date().toUTCString()}]`
const log = (...args) => console.log(timestamp(), ...args)

module.exports = log;