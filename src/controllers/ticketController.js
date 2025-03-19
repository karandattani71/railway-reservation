const { Op } = require("sequelize");
const sequelize = require("../config/database");
const Ticket = require("../models/Ticket");
const Passenger = require("../models/Passenger");
const { TICKET_STATUS, BERTH_CONFIG } = require("../constants/ticketConstants");
const ticketService = require("../services/ticketService");
const { AppError } = require("../middleware/errorHandler");

// Controller methods
exports.bookTicket = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { passenger } = req.body;

    // For children under 5, we don't need to check availability
    const availability =
      passenger.age < 5
        ? { confirmedAvailable: 0, racAvailable: 0, waitlistAvailable: 0 }
        : await ticketService.checkAvailability(transaction);

    // Only check availability for passengers 5 and older
    if (
      passenger.age >= 5 &&
      availability.confirmedAvailable <= 0 &&
      availability.racAvailable <= 0 &&
      availability.waitlistAvailable <= 0
    ) {
      throw new AppError("No tickets available in any category", 400);
    }

    const newPassenger = await Passenger.create(passenger, { transaction });
    const ticketData = await ticketService.createTicketData(
      newPassenger,
      availability,
      transaction
    );
    const ticket = await Ticket.create(ticketData, { transaction });

    await transaction.commit();

    const responseMessage =
      passenger.age < 5
        ? "Child under 5 registered successfully (no berth allocated)"
        : "Ticket booked successfully";

    res.status(201).json({
      status: "success",
      message: responseMessage,
      data: {
        ticket: {
          ...ticket.toJSON(),
          passenger: newPassenger.toJSON(),
        },
      },
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

exports.cancelTicket = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const { ticketId } = req.params;
    const ticket = await Ticket.findByPk(ticketId, { transaction });

    if (!ticket) {
      throw new AppError("Ticket not found", 404);
    }

    if (ticket.status === TICKET_STATUS.CANCELLED) {
      throw new AppError("Ticket is already cancelled", 400);
    }

    await ticket.update({ status: TICKET_STATUS.CANCELLED }, { transaction });
    await ticketService.promoteTickets(ticket, transaction);
    await transaction.commit();

    res.json({
      status: "success",
      message: "Ticket cancelled successfully",
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
          childrenNoBerth: tickets.filter(
            (t) => t.status === TICKET_STATUS.CHILD_NO_BERTH
          ),
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
