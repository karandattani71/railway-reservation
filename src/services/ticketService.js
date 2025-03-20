const { Op } = require("sequelize");
const {
  BERTH_CONFIG,
  TICKET_STATUS,
  BERTH_TYPE,
} = require("../constants/ticketConstants");
const Ticket = require("../models/Ticket");
const Passenger = require("../models/Passenger");
const sequelize = require("../config/database");

const generateBookingReference = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TKT${timestamp}${random}`;
};

const checkAvailability = async (transaction = null) => {
  const queryOptions = transaction ? { transaction } : {};
  const lockOptions = transaction
    ? { transaction, lock: transaction.LOCK.UPDATE }
    : {};

  // Get all tickets for each status
  const [confirmedTickets, racTickets, waitlistTickets] = await Promise.all([
    Ticket.findAll({
      where: { status: TICKET_STATUS.CONFIRMED },
      attributes: ["id", "berthNumber"],
      ...lockOptions,
    }),
    Ticket.findAll({
      where: { status: TICKET_STATUS.RAC },
      attributes: ["id", "racNumber"],
      ...lockOptions,
    }),
    Ticket.findAll({
      where: { status: TICKET_STATUS.WAITING_LIST },
      attributes: ["id", "waitingListNumber"],
      ...lockOptions,
    }),
  ]);

  // Calculate counts
  const confirmed = confirmedTickets.length;
  const rac = racTickets.length;
  const waitlist = waitlistTickets.length;

  // Get booked berth numbers
  const bookedBerthNumbers = new Set(
    confirmedTickets
      .filter((t) => t.berthNumber !== null)
      .map((t) => t.berthNumber)
  );

  const availableBerthNumbers = Array.from(
    { length: BERTH_CONFIG.TOTAL },
    (_, i) => i + 1
  ).filter((num) => !bookedBerthNumbers.has(num));

  // Get booked RAC numbers
  const bookedRacNums = new Set(
    racTickets.filter((t) => t.racNumber !== null).map((t) => t.racNumber)
  );

  const availableRacNumbers = Array.from(
    { length: BERTH_CONFIG.RAC * 2 },
    (_, i) => i + 1
  ).filter((num) => !bookedRacNums.has(num));

  // Get booked waiting list numbers
  const bookedWaitingNums = new Set(
    waitlistTickets
      .filter((t) => t.waitingListNumber !== null)
      .map((t) => t.waitingListNumber)
  );

  const availableWaitingNumbers = Array.from(
    { length: BERTH_CONFIG.WAITING_LIST },
    (_, i) => i + 1
  ).filter((num) => !bookedWaitingNums.has(num));

  return {
    confirmedAvailable: availableBerthNumbers.length,
    racAvailable: availableRacNumbers.length,
    waitlistAvailable: availableWaitingNumbers.length,
    availableBerthNumbers,
    availableRacNumbers,
    availableWaitingNumbers,
  };
};

const needsPriorityAllocation = (passenger) => {
  const { age, hasChild } = passenger;
  return age >= 60 || hasChild;
};

const allocateBerth = async (passenger, availableBerthNumbers, transaction) => {
  if (!needsPriorityAllocation(passenger)) {
    const berthTypes = [BERTH_TYPE.UPPER, BERTH_TYPE.MIDDLE, BERTH_TYPE.LOWER];
    return {
      berthType: berthTypes[Math.floor(Math.random() * berthTypes.length)],
      berthNumber: availableBerthNumbers[0],
    };
  }

  // Get lower berths that are already allocated
  const lowerBerthTickets = await Ticket.findAll({
    where: {
      status: TICKET_STATUS.CONFIRMED,
      berthType: BERTH_TYPE.LOWER,
    },
    attributes: ["id"],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  // Check if we can allocate a lower berth
  if (lowerBerthTickets.length < BERTH_CONFIG.LOWER_BERTH_QUOTA) {
    return {
      berthType: BERTH_TYPE.LOWER,
      berthNumber: availableBerthNumbers[0],
    };
  }

  // If no lower berth available, allocate randomly
  const berthTypes = [BERTH_TYPE.UPPER, BERTH_TYPE.MIDDLE, BERTH_TYPE.LOWER];
  return {
    berthType: berthTypes[Math.floor(Math.random() * berthTypes.length)],
    berthNumber: availableBerthNumbers[0],
  };
};

const createTicketData = async (passenger, availability, transaction) => {
  const ticketData = {
    PassengerId: passenger.id,
    bookingReference: generateBookingReference(),
  };

  // Prevent direct ticket booking for children under 5
  if (passenger.age < 5) {
    throw new Error(
      "Children under 5 years cannot book tickets directly. They must be registered with an adult passenger."
    );
  }

  // Double-check availability with locks before proceeding
  const currentAvailability = await checkAvailability(transaction);

  if (currentAvailability.confirmedAvailable > 0) {
    const berth = await allocateBerth(
      passenger,
      currentAvailability.availableBerthNumbers,
      transaction
    );
    ticketData.status = TICKET_STATUS.CONFIRMED;
    ticketData.berthType = berth.berthType;
    ticketData.berthNumber = berth.berthNumber;
  } else if (currentAvailability.racAvailable > 0) {
    ticketData.status = TICKET_STATUS.RAC;
    ticketData.berthType = BERTH_TYPE.SIDE_LOWER;
    ticketData.racNumber = currentAvailability.availableRacNumbers[0];
  } else if (currentAvailability.waitlistAvailable > 0) {
    ticketData.status = TICKET_STATUS.WAITING_LIST;
    ticketData.waitingListNumber =
      currentAvailability.availableWaitingNumbers[0];
  } else {
    throw new Error("No tickets available");
  }

  // Build where conditions based on ticket status
  let whereConditions = [];
  if (ticketData.status === TICKET_STATUS.CONFIRMED && ticketData.berthNumber) {
    whereConditions.push({
      berthNumber: ticketData.berthNumber,
      status: TICKET_STATUS.CONFIRMED,
    });
  }
  if (ticketData.status === TICKET_STATUS.RAC && ticketData.racNumber) {
    whereConditions.push({
      racNumber: ticketData.racNumber,
      status: TICKET_STATUS.RAC,
    });
  }
  if (
    ticketData.status === TICKET_STATUS.WAITING_LIST &&
    ticketData.waitingListNumber
  ) {
    whereConditions.push({
      waitingListNumber: ticketData.waitingListNumber,
      status: TICKET_STATUS.WAITING_LIST,
    });
  }

  // Verify no concurrent booking has taken this spot
  if (whereConditions.length > 0) {
    const existingTicket = await Ticket.findOne({
      where: {
        [Op.or]: whereConditions,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existingTicket) {
      throw new Error(
        "This ticket has just been booked by another user. Please try again."
      );
    }
  }

  return ticketData;
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

const cancelTicket = async (ticketId, transaction) => {
  const ticket = await Ticket.findByPk(ticketId, {
    include: [Passenger],
    transaction,
  });

  if (!ticket) {
    throw new Error("Ticket not found");
  }

  if (ticket.status === TICKET_STATUS.CANCELLED) {
    throw new Error("Ticket is already cancelled");
  }

  const originalStatus = ticket.status;

  // Update the current ticket to cancelled
  await ticket.update({ status: "CANCELLED" }, { transaction });

  // If the cancelled ticket was confirmed, promote RAC to confirmed
  if (originalStatus === TICKET_STATUS.CONFIRMED) {
    const nextRacTicket = await Ticket.findOne({
      where: { status: TICKET_STATUS.RAC },
      order: [["racNumber", "ASC"]],
      transaction,
    });

    if (nextRacTicket) {
      // Promote RAC to confirmed
      await nextRacTicket.update(
        {
          status: TICKET_STATUS.CONFIRMED,
          berthType: ticket.berthType,
          berthNumber: ticket.berthNumber,
          racNumber: null,
        },
        { transaction }
      );

      // Find next waiting list ticket to promote to RAC
      const nextWaitingTicket = await Ticket.findOne({
        where: { status: TICKET_STATUS.WAITING_LIST },
        order: [["waitingListNumber", "ASC"]],
        transaction,
      });

      if (nextWaitingTicket) {
        // Promote waiting list to RAC
        await nextWaitingTicket.update(
          {
            status: TICKET_STATUS.RAC,
            racNumber: nextRacTicket.racNumber,
            waitingListNumber: null,
          },
          { transaction }
        );

        // Reorder remaining waiting list numbers
        await Ticket.update(
          { waitingListNumber: sequelize.literal('"waitingListNumber" - 1') },
          {
            where: {
              status: TICKET_STATUS.WAITING_LIST,
              waitingListNumber: {
                [Op.gt]: nextWaitingTicket.waitingListNumber,
              },
            },
            transaction,
          }
        );
      }
    }
  }
  // If the cancelled ticket was RAC, promote waiting list to RAC
  else if (originalStatus === TICKET_STATUS.RAC) {
    const nextWaitingTicket = await Ticket.findOne({
      where: { status: TICKET_STATUS.WAITING_LIST },
      order: [["waitingListNumber", "ASC"]],
      transaction,
    });

    if (nextWaitingTicket) {
      // Promote waiting list to RAC
      await nextWaitingTicket.update(
        {
          status: TICKET_STATUS.RAC,
          racNumber: ticket.racNumber,
          waitingListNumber: null,
        },
        { transaction }
      );

      // Reorder remaining waiting list numbers
      await Ticket.update(
        { waitingListNumber: sequelize.literal('"waitingListNumber" - 1') },
        {
          where: {
            status: TICKET_STATUS.WAITING_LIST,
            waitingListNumber: { [Op.gt]: nextWaitingTicket.waitingListNumber },
          },
          transaction,
        }
      );
    }

    // Reorder remaining RAC numbers
    await Ticket.update(
      { racNumber: sequelize.literal('"racNumber" - 1') },
      {
        where: {
          status: TICKET_STATUS.RAC,
          racNumber: { [Op.gt]: ticket.racNumber },
        },
        transaction,
      }
    );
  }
  // If the cancelled ticket was waiting list, reorder remaining waiting list numbers
  else if (originalStatus === TICKET_STATUS.WAITING_LIST) {
    await Ticket.update(
      { waitingListNumber: sequelize.literal('"waitingListNumber" - 1') },
      {
        where: {
          status: TICKET_STATUS.WAITING_LIST,
          waitingListNumber: { [Op.gt]: ticket.waitingListNumber },
        },
        transaction,
      }
    );
  }

  return ticket;
};

module.exports = {
  checkAvailability,
  createTicketData,
  getTicketSummary,
  cancelTicket,
  generateBookingReference,
};
