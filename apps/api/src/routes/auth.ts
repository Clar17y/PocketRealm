import { Router } from 'express';
import { RATE_LIMIT_CONSTANTS } from '@pocketrealm/shared';
import { authenticate } from '../middleware/auth';
import { createEndpointLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { sendRouteServiceResponse } from '../utils/routeServiceResponse';
import {
  changeAccountEmail,
  changeAccountPassword,
  joinActiveSeason,
  listCharacters,
  listSeasonArchives,
  loginAccount,
  logoutAccount,
  refreshSession,
  registerAccount,
  requestPasswordReset,
  resendVerificationEmail,
  resetAccountPassword,
  switchActivePlayer,
  verifyEmailAddress,
} from '../services/authRouteService';

export const authRouter = Router();

const loginLimiter = createEndpointLimiter('login', RATE_LIMIT_CONSTANTS.LOGIN_WINDOW_MS, RATE_LIMIT_CONSTANTS.LOGIN_MAX, { message: 'Too many login attempts, please try again later' });
const registerLimiter = createEndpointLimiter('register', RATE_LIMIT_CONSTANTS.REGISTER_WINDOW_MS, RATE_LIMIT_CONSTANTS.REGISTER_MAX, { message: 'Too many registration attempts, please try again later', passOnStoreError: false });
const resendVerificationLimiter = createEndpointLimiter('resend-verification', RATE_LIMIT_CONSTANTS.RESEND_VERIFICATION_WINDOW_MS, RATE_LIMIT_CONSTANTS.RESEND_VERIFICATION_MAX, { message: 'Too many verification requests, please try again later' });
const forgotPasswordLimiter = createEndpointLimiter('forgot-password', RATE_LIMIT_CONSTANTS.FORGOT_PASSWORD_WINDOW_MS, RATE_LIMIT_CONSTANTS.FORGOT_PASSWORD_MAX, { message: 'Too many password reset requests, please try again later' });

authRouter.post('/register', registerLimiter, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await registerAccount({ body: req.body }));
}));

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await loginAccount({ body: req.body }));
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await refreshSession({ body: req.body }));
}));

authRouter.get('/characters', authenticate, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await listCharacters({ player: req.player! }));
}));

authRouter.get('/season-archives', authenticate, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await listSeasonArchives({ player: req.player! }));
}));

authRouter.post('/switch-player', authenticate, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await switchActivePlayer({ body: req.body, player: req.player! }));
}));

authRouter.post('/join-season', authenticate, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await joinActiveSeason({ body: req.body, player: req.player! }));
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await logoutAccount({ body: req.body }));
}));

authRouter.post('/verify-email', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await verifyEmailAddress({ body: req.body }));
}));

authRouter.post('/resend-verification', authenticate, resendVerificationLimiter, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await resendVerificationEmail({ player: req.player! }));
}));

authRouter.post('/forgot-password', forgotPasswordLimiter, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await requestPasswordReset({ body: req.body }));
}));

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await resetAccountPassword({ body: req.body }));
}));

authRouter.post('/change-email', authenticate, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await changeAccountEmail({ body: req.body, player: req.player! }));
}));

authRouter.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  sendRouteServiceResponse(res, await changeAccountPassword({ body: req.body, player: req.player! }));
}));
