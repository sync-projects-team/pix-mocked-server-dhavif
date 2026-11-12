import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { errorFormatter } from "../libs/utils";

export const createValidationPipe = (): ValidationPipe => new ValidationPipe({
    disableErrorMessages: false,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(errorFormatter(errors)),
});
