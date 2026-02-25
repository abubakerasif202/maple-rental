import { Admin } from '../types';

declare global {
  namespace Express {
    interface Request {
      admin?: Admin;
    }
  }
}
