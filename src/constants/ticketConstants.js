const BERTH_CONFIG = {
  TOTAL: 63,
  RAC: 9,
  WAITING_LIST: 10,
  LOWER_BERTH_QUOTA: 21, // 1/3 of total berths
};

const TICKET_STATUS = {
  CONFIRMED: "CONFIRMED",
  RAC: "RAC",
  WAITING_LIST: "WAITING_LIST",
  CHILD_NO_BERTH: "CHILD_NO_BERTH", // New status for children under 5
};

const BERTH_TYPE = {
  UPPER: "UPPER",
  MIDDLE: "MIDDLE",
  LOWER: "LOWER",
  SIDE_UPPER: "SIDE_UPPER",
  SIDE_LOWER: "SIDE_LOWER",
};

module.exports = {
  BERTH_CONFIG,
  TICKET_STATUS,
  BERTH_TYPE,
};
