const mongoose = require("mongoose");
const TrustedSchema = new mongoose.Schema({
  googleId: {type: String, required: true, unique: true,},
  Domains: {type: [String]}
})
module.exports = mongoose.model("TrustedDomains", TrustedSchema);