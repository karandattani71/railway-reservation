const express = require("express");
const { body, param } = require("express-validator");
const ticketController = require("../controllers/ticketController");
const validateRequest = require("../middleware/validateRequest");

const router = express.Router();

// Custom validation for age
const validateAge = (value) => {
  if (value < 0 || value > 120) {
    throw new Error("Age must be between 0 and 120");
  }
  return true;
};

// Validation middleware for booking
const bookingValidation = [
  body("passenger.name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Name must be between 2 and 50 characters"),

  body("passenger.age")
    .isInt()
    .custom(validateAge)
    .withMessage("Age must be between 0 and 120"),

  body("passenger.gender")
    .isIn(["MALE", "FEMALE", "OTHER"])
    .withMessage("Gender must be MALE, FEMALE, or OTHER"),

  body("passenger.contactNumber")
    .notEmpty()
    .withMessage("Contact number is required")
    .matches(/^\+?[\d\s-]{8,}$/)
    .withMessage("Invalid contact number format"),

  body("passenger.email")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("passenger.hasChild")
    .optional()
    .isBoolean()
    .withMessage("hasChild must be true or false"),

  validateRequest,
];

// Validation for ticket ID parameter
const ticketIdValidation = [
  param("ticketId").isUUID(4).withMessage("Invalid ticket ID format"),
  validateRequest,
];

// Routes
router.post("/book", bookingValidation, ticketController.bookTicket);
router.get("/booked", ticketController.getBookedTickets);
router.get("/available", ticketController.getAvailableTickets);
router.get("/:ticketId", ticketIdValidation, ticketController.getTicketById);
router.post(
  "/cancel/:ticketId",
  ticketIdValidation,
  ticketController.cancelTicket
);

module.exports = router;
