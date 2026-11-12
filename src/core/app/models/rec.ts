import { IsDateString, IsDefined, IsEnum, IsNotEmpty, IsNotEmptyObject, IsNumberString, MaxLength, ValidateNested, IsOptional } from "class-validator"
import { Pessoa, PixID } from "../models"
import { Type } from "class-transformer"
import { MinStringNumber, NotPast } from "../../../validators/custom-validators"

export class Vinculo {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @MaxLength(35, { message: 'O campo $$ não respeita o schema.' })
    objeto: string
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @MaxLength(35, { message: 'O campo $$ não respeita o schema.' })
    contrato: string
    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested()
    @Type(() => Pessoa)
    devedor: Pessoa
}

export enum PoliticaRetentativa {
    Permite = "PERMITE_3R_7D",
    NaoPermite = "NAO_PERMITE"
}

export class ValorRecebimento {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsNumberString({}, { message: 'O campo $$ não respeita o schema.' })
    @MinStringNumber(0.01, { message: 'O campo $$ é zero.' })
    valorRec: string
}

export enum PeriodicidadeRecorrencia {
    Semanal = "SEMANAL",
    Mensal = "MENSAL",
    Trimestral = "TRIMESTRAL",
    Semestral = "SEMESTRAL",
    Anual = "ANUAL"
}

export class CalendarioRecorrencia {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    @NotPast({ message: 'O campo $$ é anterior à data de criação da cobrança.' })
    dataInicial: string

    @IsOptional()
    @IsDateString({}, { message: 'O campo $$ não respeita o schema.' })
    @NotPast({ message: 'O campo $$ é anterior à data de criação da cobrança.' })
    dataFinal?: string

    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsEnum(PeriodicidadeRecorrencia, { message: 'O campo $$ não respeita o schema.' })
    periodicidade: PeriodicidadeRecorrencia
}

export class AtivacaoRecorrencia {
    @ValidateNested({})
    @Type(() => PixID)
    dadosJornada: PixID
}


export class RecPostRequest {
    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested({})
    @Type(() => Vinculo)
    vinculo: Vinculo

    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested({})
    @Type(() => CalendarioRecorrencia)
    calendario: CalendarioRecorrencia

    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested({})
    @Type(() => ValorRecebimento)
    valor: ValorRecebimento

    @IsNotEmpty()
    @IsEnum(PoliticaRetentativa, { message: 'O campo $$ não respeita o schema.' })
    politicaRetentativa: PoliticaRetentativa

    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested({})
    @Type(() => Pessoa)
    recebedor: Pessoa

    @IsDefined({ message: 'O objeto $$ não respeita o schema.' })
    @IsNotEmptyObject({ nullable: false }, { message: 'O objeto $$ não respeita o schema.' })
    @ValidateNested({})
    @Type(() => AtivacaoRecorrencia)
    ativacao: AtivacaoRecorrencia
}

export class RecRequest<T> {
    IdOwner: string
    data: T
}