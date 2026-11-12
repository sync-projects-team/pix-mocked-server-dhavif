import { IsNotEmpty, IsNotEmptyObject, IsNumberString, ValidateNested, IsIn, IsOptional } from "class-validator"
import { Chave, ICriacao, ValidadeVencimento, IInfoAdicional, Pessoa, PixID, ModalidadeAlteracao, Situacao, PixRevisao, IJuros, IDesconto, IMulta } from "../models"
import { Type } from "class-transformer"
import { IntersectionType } from '@nestjs/swagger';
import { IsCNPJValid,  IsCPFValid, IsDICTExists, IsDICTValid, MinStringNumber } from "../../../validators/custom-validators";
import { LocID, LocGetRequest } from "./loc";

/** 	
Todos os campos que indicam valores monetários obedecem ao pattern \d{1,10}.\d{2}. O separador decimal é o caractere ponto. Não é aplicável utilizar separador de milhar. Exemplos de valores aderentes ao padrão: “1.00”, “123.99”, “123456789.23" */
export class Valor {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsNumberString({}, { message: 'O campo $$ não respeita o schema.' })
    @MinStringNumber(0.01, { message: 'O campo $$ é zero.' })
    original: string
    multa: IMulta
    juros: IJuros
    desconto: IDesconto
}

export class Alteracao {
    /** Trata-se de um campo que determina se o valor final do documento pode ser alterado pelo pagador. Na ausência desse campo, assume-se que não se pode alterar o valor do documento de cobrança, ou seja, assume-se o valor 0. Se o campo estiver presente e com valor 1, então está determinado que o valor final da cobrança pode ter seu valor alterado pelo pagador. */
    modalidadeAlteracao?: ModalidadeAlteracao
}

export class Retirada {
    retirada?: any
}


export class CobVGetResponse implements Chave, PixID, PixRevisao {
    revisao: number
    txid: string
    chave: string
    calendario: ICriacao & ValidadeVencimento
    loc: LocGetRequest
    location: string
    status: Situacao
    devedor: Pessoa
    valor: Valor & Alteracao & Retirada
    solicitacaoPagador: string
    infoAdicionais: IInfoAdicional[]
}

export class CobVValor extends IntersectionType(Valor, Alteracao, Retirada)
{

}

export class CobVPutRequest {
    @IsNotEmpty({ message: 'O campo $$ não respeita o schema.' })
    @IsDICTValid({ message: 'O campo $$ não respeita o schema.' })
    @IsDICTExists({ message: 'O campo $$ corresponde a uma conta que não pertence a este usuário recebedor.' })
    chave?: string

    @IsNotEmptyObject({ nullable: false }, { message: 'O campo $$ não respeita o schema.' })
    @ValidateNested({})
    @Type(() => CobVValor)
    valor: CobVValor
    @IsOptional()
    @ValidateNested({})
    @Type(() => ValidadeVencimento)
    calendario?: ValidadeVencimento
    @IsOptional()
    @ValidateNested()
    @Type(() => Pessoa)
    devedor?: Pessoa
    solicitacaoPagador?: string
    infoAdicionais?: IInfoAdicional[]
}

export class CobVPatchRequest {
    @IsOptional()
    @ValidateNested({})
    @Type(() => LocID)
    loc?: LocID
    @IsOptional()
    @ValidateNested()
    @Type(() => CobVValor)
    valor?: CobVValor
    @IsOptional()
    @ValidateNested()
    @Type(() => ValidadeVencimento)
    calendario?: ValidadeVencimento
    @IsOptional()
    @ValidateNested({})
    @Type(() => Pessoa)
    devedor?: Pessoa
    solicitacaoPagador?: string
    @IsOptional()
    @IsIn([Situacao.Removida], { message: 'O campo $$ não respeita o schema.' })
    status?: "REMOVIDA_PELO_USUARIO_RECEBEDOR"
}


export class CobVPutResponse extends CobVGetResponse {

}

export class CobVPatchResponse extends CobVGetResponse {

}



export interface ICobVQueryRequest {
    inicio: string,
    fim: string,
    cpf?: string,
    cnpj?: string,
    locationPresente?: boolean,
    status: string,
    paginacao: {
        paginaAtual: number,
        itensPorPagina: number
    }
}

export interface ICobVQueryResponse {
    parametros: {
        inicio: string,
        fim: string,
        paginacao: {
            paginaAtual: number,
            itensPorPagina: number,
            quantidadeDePaginas: number,
            quantidadeTotalDeItens: number
        }
    },
    cobs: { $ref: string }[]
}


export class CobVGetFilter {
    inicio: string
    fim: string
    @IsOptional()
    @IsCPFValid({ message: 'O campo $$ não respeita o schema.' })
    cpf?: string
    @IsOptional()
    @IsCNPJValid({ message: 'O campo $$ não respeita o schema.' })
    cnpj?: string
    paginacao?: { paginaAtual: number, itensPorPagina: number }
    status?: Situacao
    locationPresente?: boolean
}