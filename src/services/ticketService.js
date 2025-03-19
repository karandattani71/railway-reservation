const { Op } = require("sequelize");
const {
  BERTH_CONFIG,
  TICKET_STATUS,
  BERTH_TYPE,
} = require("../constants/ticketConstants");
const Ticket = require("../models/Ticket");
const Passenger = require("../models/Passenger");
const sequelize = require("sequelize");

const generateBookingReference = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TKT${timestamp}${random}`;
};

const checkAvailability = async (transaction) => {
  const [confirmed, rac, waitlist] = await Promise.all([
    Ticket.count({
      where: {
        status: TICKET_STATUS.CONFIRMED,
        [Op.not]: { status: TICKET_STATUS.CHILD_NO_BERTH },
      },
      transaction,
    }),
    Ticket.count({
      where: { status: TICKET_STATUS.RAC },
      transaction,
    }),
    Ticket.count({
      where: { status: TICKET_STATUS.WAITING_LIST },
      transaction,
    }),
  ]);

  return {
    confirmedAvailable: BERTH_CONFIG.TOTAL - confirmed,
    racAvailable: BERTH_CONFIG.RAC * 2 - rac,
    waitlistAvailable: BERTH_CONFIG.WAITING_LIST - waitlist,
  };
};

const needsPriorityAllocation = (passenger) => {
  const { age, hasChild } = passenger;
  return age >= 60 || hasChild;
};

const allocateBerth = async (passenger, transaction) => {
  if (!needsPriorityAllocation(passenger)) {
    const berthTypes = [BERTH_TYPE.UPPER, BERTH_TYPE.MIDDLE, BERTH_TYPE.LOWER];
    return berthTypes[Math.floor(Math.random() * berthTypes.length)];
  }

  const lowerBerthAvailable = await Ticket.count({
    where: {
      status: TICKET_STATUS.CONFIRMED,
      berthType: BERTH_TYPE.LOWER,
    },
    transaction,
  });

  return lowerBerthAvailable < BERTH_CONFIG.LOWER_BERTH_QUOTA
    ? BERTH_TYPE.LOWER
    : [BERTH_TYPE.UPPER, BERTH_TYPE.MIDDLE, BERTH_TYPE.LOWER][
        Math.floor(Math.random() * 3)
      ];
};

const createTicketData = async (passenger, availability, transaction) => {
  const ticketData = {
    PassengerId: passenger.id,
    bookingReference: generateBookingReference(),
  };

  // Children under 5 don't get a berth
  if (passenger.age < 5) {
    ticketData.status = TICKET_STATUS.CHILD_NO_BERTH;
    ticketData.berthType = null;
    ticketData.berthNumber = null;
    return ticketData;
  }

  if (availability.confirmedAvailable > 0) {
    ticketData.status = TICKET_STATUS.CONFIRMED;
    ticketData.berthType = await allocateBerth(passenger, transaction);
    ticketData.berthNumber = availability.confirmedAvailable;
  } else if (availability.racAvailable > 0) {
    ticketData.status = TICKET_STATUS.RAC;
    ticketData.berthType = BERTH_TYPE.SIDE_LOWER;
    ticketData.racNumber = availability.racAvailable;
  } else if (availability.waitlistAvailable > 0) {
    ticketData.status = TICKET_STATUS.WAITING_LIST;
    ticketData.waitingListNumber = availability.waitlistAvailable;
  } else {
    throw new Error("No tickets available");
  }

  return ticketData;
};

const promoteTickets = async (cancelledTicket, transaction) => {
  // Only promote tickets if a confirmed ticket is cancelled
  if (cancelledTicket.status !== TICKET_STATUS.CONFIRMED) {
    return;
  }

  // Step 1: Find the next RAC ticket to promote to confirmed
  const nextRacTicket = await Ticket.findOne({
    where: { status: TICKET_STATUS.RAC },
    order: [["createdAt", "ASC"]],
    include: [
      {
        model: Passenger,
        attributes: ["age", "hasChild"],
      },
    ],
    transaction,
  });

  if (nextRacTicket) {
    // Promote RAC ticket to confirmed with appropriate berth allocation
    const berthType = await allocateBerth(nextRacTicket.Passenger, transaction);
    await nextRacTicket.update(
      {
        status: TICKET_STATUS.CONFIRMED,
        berthType: berthType,
        berthNumber: cancelledTicket.berthNumber,
        racNumber: null,
      },
      { transaction }
    );

    // Step 2: Find the next waiting list ticket to promote to RAC
    const nextWaitingListTicket = await Ticket.findOne({
      where: { status: TICKET_STATUS.WAITING_LIST },
      order: [["createdAt", "ASC"]],
      transaction,
    });

    if (nextWaitingListTicket) {
      // Promote waiting list ticket to RAC
      await nextWaitingListTicket.update(
        {
          status: TICKET_STATUS.RAC,
          berthType: BERTH_TYPE.SIDE_LOWER,
          waitingListNumber: null,
          racNumber: nextRacTicket.racNumber, // Assign the previous RAC number
        },
        { transaction }
      );

      // Reorder remaining waiting list numbers
      await Ticket.update(
        {
          waitingListNumber: sequelize.literal("waitingListNumber - 1"),
        },
        {
          where: {
            status: TICKET_STATUS.WAITING_LIST,
            waitingListNumber: {
              [Op.gt]: nextWaitingListTicket.waitingListNumber,
            },
          },
          transaction,
        }
      );
    }

    // Reorder remaining RAC numbers
    await Ticket.update(
      {
        racNumber: sequelize.literal("racNumber - 1"),
      },
      {
        where: {
          status: TICKET_STATUS.RAC,
          racNumber: {
            [Op.gt]: nextRacTicket.racNumber,
          },
        },
        transaction,
      }
    );
  }

  // Finally, update the cancelled ticket's status
  await cancelledTicket.update(
    {
      status: TICKET_STATUS.CANCELLED,
      berthNumber: null,
      berthType: null,
      racNumber: null,
      waitingListNumber: null,
    },
    { transaction }
  );
};

const getTicketSummary = (tickets) => ({
  total: tickets.length,
  confirmed: tickets.filter((t) => t.status === TICKET_STATUS.CONFIRMED).length,
  rac: tickets.filter((t) => t.status === TICKET_STATUS.RAC).length,
  waitingList: tickets.filter((t) => t.status === TICKET_STATUS.WAITING_LIST)
    .length,
  childrenNoBerth: tickets.filter(
    (t) => t.status === TICKET_STATUS.CHILD_NO_BERTH
  ).length,
});

module.exports = {
  checkAvailability,
  createTicketData,
  promoteTickets,
  getTicketSummary,
};
