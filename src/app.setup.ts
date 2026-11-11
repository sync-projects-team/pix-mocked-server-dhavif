import { INestApplication } from '@nestjs/common';
import { createValidationPipe } from './validators/validation.pipe';

export const configureApp = (app: INestApplication): INestApplication => app.useGlobalPipes(createValidationPipe());
