import { registerDecorator, ValidationOptions } from 'class-validator';
import { VALIDATORS } from '../libs/messages';
import { MemoryDB } from '../libs/fakedb';
import { flatDate } from '../libs/utils';


export function MinStringNumber(min: number, validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: (value: string) => Number.parseFloat(value) >= min },
        });
    };

}

export function IsDICTValid(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: (value: string) => typeof value === 'string' && !VALIDATORS.chaveDICT(propertyName, value) },
        });
    };

}

export function IsDICTExists(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            async: true,
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: async (chave: string) => !!(await MemoryDB.get("CORRENTISTAS").read("DEV", { chave })) },
        });
    };

}
export function IsCPFValid(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: (value: string) => typeof value === 'string' && !VALIDATORS.cpf(propertyName, value) },
        });
    };
}

export function IsCNPJValid(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: (value: string) => typeof value === 'string' && !VALIDATORS.cnpj(propertyName, value) },
        });
    };
}


export function IsCPFCNPJValid(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: (value: string) => typeof value === 'string' && (value.length === 11) ? !VALIDATORS.cpf(propertyName, value) : !VALIDATORS.cnpj(propertyName, value) },
        });
    };
}

export function IsCorrentistaExists(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            async: true,
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: async (cpfcnpj: string) => !!(await MemoryDB.get("CORRENTISTAS").read("DEV", { cpfcnpj })) },
        });
    };
}

export function NotPast(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: (value: string) => flatDate(new Date(value)) >= flatDate(new Date()) },
        });
    };
}

export function IsIDRec(validationOptions?: ValidationOptions) {
    return function (object: any, propertyName: string) {
        registerDecorator({
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: { validate: (value: string) => !VALIDATORS.IDRec(propertyName, value) },
        });
    };
}