import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { AppError } from "../middleware/errorHandler";
import User from "../models/User";
import Medication from "../models/Medication";
import Schedule from "../models/Schedule";
import { catchAsync } from "../middleware/errorHandler";
import { calculateUserAdherence } from "../utils/calculateUserAdherence";

const router = Router();

/**
 * @route   GET /api/users
 * @desc    Get all users
 * @access  Private
 */
router.get(
  "/",
  catchAsync(async (req: Request, res: Response) => {
    const { role, active = true, limit = 50, offset = 0 } = req.query;

    // Build query
    const query: any = { isActive: active === "true" };

    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit as string))
      .skip(parseInt(offset as string));

    const total = await User.countDocuments(query);

    res.status(200).json({
      status: "success",
      results: users.length,
      total,
      data: users,
    });
  })
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
router.get(
  "/:id",
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await User.findById(id).populate({
      path: "medications",
      match: { isActive: true },
      select: "name dosage frequencyHours startTime durationDays isActive",
    });

    if (!user) {
      throw new AppError("User not found", 404);
    }

    res.status(200).json({
      status: "success",
      data: user,
    });
  })
);

/**
 * @route   GET /api/users/telex/:telexId
 * @desc    Get user by Telex ID
 * @access  Private
 */
router.get(
  "/telex/:telexId",
  catchAsync(async (req: Request, res: Response) => {
    const { telexId } = req.params;

    const user = await (User as any).findByTelexId(telexId);

    if (!user) {
      throw new AppError("User not found", 404);
    }

    res.status(200).json({
      status: "success",
      data: user,
    });
  })
);

/**
 * @route   POST /api/users
 * @desc    Create new user
 * @access  Private
 */
router.post(
  "/",
  catchAsync(async (req: Request, res: Response) => {
    const { telexId, role, name, timezone = "UTC" } = req.body;

    // Validate required fields
    if (!telexId || !role || !name) {
      throw new AppError("Telex ID, role, and name are required", 400);
    }

    // Check if user already exists
    const existingUser = await (User as any).findByTelexId(telexId);
    if (existingUser) {
      throw new AppError("User with this Telex ID already exists", 409);
    }

    // Validate role
    const validRoles = ["patient", "caregiver"];
    if (!validRoles.includes(role)) {
      throw new AppError("Role must be either patient or caregiver", 400);
    }

    // Create user
    const user = new User({
      telexId: telexId.trim(),
      role,
      name: name.trim(),
      timezone: timezone.trim(),
    });

    await user.save();

    logger.info("👤 New user created", {
      userId: user._id,
      telexId,
      role,
      name: user.name,
    });

    res.status(201).json({
      status: "success",
      data: user,
    });
  })
);

/**
 * @route   PATCH /api/users/:id
 * @desc    Update user
 * @access  Private
 */
router.patch(
  "/:id",
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const updates = req.body;

    const user = await User.findById(id);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Don't allow updating certain fields directly
    const allowedUpdates = ["name", "timezone", "isActive"];
    const actualUpdates = Object.keys(updates)
      .filter((key) => allowedUpdates.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {} as any);

    Object.assign(user, actualUpdates);
    await user.save();

    logger.info("👤 User updated", {
      userId: id,
      updates: actualUpdates,
    });

    res.status(200).json({
      status: "success",
      data: user,
    });
  })
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Deactivate user
 * @access  Private
 */
router.delete(
  "/:id",
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Soft delete by deactivating
    await (user as any).deactivate();

    // Deactivate all medications for this user
    await Medication.updateMany(
      { userId: id, isActive: true },
      { isActive: false }
    );

    logger.info("👤 User deactivated", {
      userId: id,
      name: user.name,
    });

    res.status(204).json({
      status: "success",
      data: null,
    });
  })
);

/**
 * @route   GET /api/users/:id/medications
 * @desc    Get user's medications
 * @access  Private
 */
router.get(
  "/:id/medications",
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { active = true } = req.query;

    const user = await User.findById(id);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const medications = await Medication.find({
      userId: id,
      isActive: active === "true",
    }).sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      results: medications.length,
      data: medications,
    });
  })
);

/**
 * @route   GET /api/users/:id/adherence
 * @desc    Get user's adherence statistics
 * @access  Private
 */
router.get(
  "/:id/adherence",
  catchAsync(async (req: Request, res: Response): Promise<Response> => {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const user = await User.findById(id);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const adherenceData = await calculateUserAdherence(id, Number(days));

    return res.status(200).json({
      status: "success",
      data: adherenceData,
    });
  })
);

/**
 * @route   POST /api/users/:id/reactivate
 * @desc    Reactivate user and medications
 * @access  Private
 */
router.post(
  "/:id/reactivate",
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Reactivate user
    await (user as any).activate();

    // Reactivate medications
    await Medication.updateMany(
      { userId: id, isActive: false },
      { isActive: true }
    );

    logger.info("👤 User reactivated", {
      userId: id,
      name: user.name,
    });

    res.status(200).json({
      status: "success",
      message: "User and medications reactivated",
    });
  })
);

export default router;
