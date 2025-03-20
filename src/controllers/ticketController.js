const { Op } = require("sequelize");
const sequelize = require("../config/database");
const Ticket = require("../models/Ticket");
const Passenger = require("../models/Passenger");
const { TICKET_STATUS, BERTH_CONFIG } = require("../constants/ticketConstants");
const ticketService = require("../services/ticketService");
const { AppError } = require("../middleware/errorHandler");

// Helper function for generating booking reference
const generateBookingReference = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TKT${timestamp}${random}`;
};

// Controller methods
exports.bookTicket = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { passenger } = req.body;
    const childPassenger = passenger.childPassenger;

    // Validate child passenger registration
    if (childPassenger) {
      if (childPassenger.age >= 5) {
        throw new AppError("Child passenger must be under 5 years old", 400);
      }
    }

    // Check availability only for adult passenger
    const availability = await ticketService.checkAvailability(transaction);

    if (
      availability.confirmedAvailable <= 0 &&
      availability.racAvailable <= 0 &&
      availability.waitlistAvailable <= 0
    ) {
      throw new AppError("No tickets available in any category", 400);
    }

    // Create adult passenger
    const newPassenger = await Passenger.create(passenger, { transaction });
    const ticketData = await ticketService.createTicketData(
      newPassenger,
      availability,
      transaction
    );
    const adultTicket = await Ticket.create(ticketData, { transaction });

    let childTicket = null;
    // Create child passenger and ticket if provided
    if (childPassenger) {
      const newChildPassenger = await Passenger.create(
        {
          ...childPassenger,
          contactNumber: passenger.contactNumber,
          email: passenger.email,
          hasChild: false,
        },
        { transaction }
      );

      const childTicketData = {
        PassengerId: newChildPassenger.id,
        status: TICKET_STATUS.CHILD_NO_BERTH,
        bookingReference: generateBookingReference(),
        berthType: null,
        berthNumber: null,
        parentTicketId: adultTicket.id,
      };
      childTicket = await Ticket.create(childTicketData, { transaction });
    }

    await transaction.commit();

    // Fetch complete ticket details including passengers
    const completeAdultTicket = await Ticket.findByPk(adultTicket.id, {
      include: [
        {
          model: Passenger,
          attributes: [
            "name",
            "age",
            "gender",
            "contactNumber",
            "email",
            "hasChild",
          ],
        },
        {
          model: Ticket,
          as: "childTicket",
          include: [
            {
              model: Passenger,
              attributes: ["name", "age", "gender"],
            },
          ],
        },
      ],
    });

    res.status(201).json({
      status: "success",
      message: childTicket
        ? "Tickets booked successfully for adult and child"
        : "Ticket booked successfully",
      data: {
        ticket: completeAdultTicket,
      },
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.getBookedTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.findAll({
      where: {
        status: {
          [Op.notIn]: [TICKET_STATUS.CANCELLED],
        },
        parentTicketId: null, // Only fetch parent tickets
      },
      include: [
        {
          model: Passenger,
          attributes: [
            "name",
            "age",
            "gender",
            "contactNumber",
            "email",
            "hasChild",
          ],
        },
        {
          model: Ticket,
          as: "childTicket",
          include: [
            {
              model: Passenger,
              attributes: ["name", "age", "gender"],
            },
          ],
        },
      ],
    });

    const summary = ticketService.getTicketSummary(tickets);

    res.json({
      status: "success",
      data: {
        tickets,
        summary,
        categories: {
          confirmed: tickets.filter(
            (t) => t.status === TICKET_STATUS.CONFIRMED
          ),
          rac: tickets.filter((t) => t.status === TICKET_STATUS.RAC),
          waitingList: tickets.filter(
            (t) => t.status === TICKET_STATUS.WAITING_LIST
          ),
          childrenNoBerth: tickets.filter((t) => t.childTicket !== null),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getAvailableTickets = async (req, res, next) => {
  try {
    const availability = await ticketService.checkAvailability();

    res.json({
      status: "success",
      data: {
        availability: {
          confirmed: availability.confirmedAvailable,
          rac: availability.racAvailable,
          waitingList: availability.waitlistAvailable,
        },
        summary: {
          totalBerths: BERTH_CONFIG.TOTAL,
          racBerths: BERTH_CONFIG.RAC,
          maxWaitingList: BERTH_CONFIG.WAITING_LIST,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getTicketById = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: Passenger,
          attributes: [
            "name",
            "age",
            "gender",
            "contactNumber",
            "email",
            "hasChild",
          ],
        },
        {
          model: Ticket,
          as: "childTicket",
          include: [
            {
              model: Passenger,
              attributes: ["name", "age", "gender"],
            },
          ],
        },
        {
          model: Ticket,
          as: "parentTicket",
          include: [
            {
              model: Passenger,
              attributes: [
                "name",
                "age",
                "gender",
                "contactNumber",
                "email",
                "hasChild",
              ],
            },
          ],
        },
      ],
    });

    if (!ticket) {
      throw new AppError("Ticket not found", 404);
    }

    res.json({
      status: "success",
      data: {
        ticket,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.cancelTicket = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { ticketId } = req.params;
    const cancelledTicket = await ticketService.cancelTicket(
      ticketId,
      transaction
    );

    await transaction.commit();

    res.json({
      status: "success",
      message: "Ticket cancelled successfully",
      data: {
        ticket: cancelledTicket,
      },
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};
