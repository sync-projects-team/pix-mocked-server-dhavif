import { CallHandler, ExecutionContext, Injectable, NestInterceptor, HttpException, UnauthorizedException, InternalServerErrorException, BadRequestException, NotFoundException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { catchError, Observable, tap } from "rxjs";
import { owners } from './data/db.json'


@Injectable()
export class HttpInterceptor implements NestInterceptor {


    private handleError = (type: string, title: string, detail: string, status: number, violacoes: { razao: string, propriedade: string }[]) => (
        {
            type,
            title,
            status,
            detail,
            violacoes
        }
    )



    private ServerErrorTypes = {
        400: (prefix: string, detail: string, violacoes: { razao: string, propriedade: string }[]) => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/${prefix}OperacaoInvalida`, 'Payload Inválido', detail, 400, violacoes)),
        RequisicaoInvalida: (violacoes: { razao: string, propriedade: string }[]) => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/RequisicaoInvalida`, 'Requisição Inválida', 'A requisição não respeita o schema.', 400, violacoes)),
        401: () => this.handleError("https://pix.bcb.gov.br/api/v2/error/AcessoNegado", "Acesso Negado", "Access Token inválido.", 401, []),
        403: (detail: string = 'Requisição de participante autenticado que viola alguma regra de autorização.', violacoes: { razao: string, propriedade: string }[] = []) => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/AcessoNegado`, `Acesso Negado`, detail, 403, violacoes)),
        404: () => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/NaoEncontrado`, `Não Encontrado`, 'Entidade não encontrada.', 404, [])),
        503: () => (this.handleError(`https://pix.bcb.gov.br/api/v2/error/ServicoIndisponivel`, 'Serviço Indisponível', `Serviço não está disponível no momento. Serviço solicitado pode estar em manutenção ou fora da janela de funcionamento.`, 503, [])),
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<void> {
        const request = context.switchToHttp().getRequest();
        const token = request.headers['mocked-token'];

        const own = token ? owners.find(f => f.token === token) : undefined;

        if (own) {
            request.headers['IdOwner'] = own.id;

            return next.handle().pipe(
                tap((res) => {
                    if ((request.method === 'GET' || request.method === 'PATCH' || request.method === 'DELETE') && !res) {
                        throw new NotFoundException();
                    }
                    else {    
                        return res;
                    }
                }),
                catchError((err: HttpException): Observable<any> => {
                    const statusHandle = {
                        400: () => {
                            const endpoint = request['url'].split('?')[0].split('/')[1];
                            const msgs = err.getResponse().valueOf();
                            const violacoes = Object.keys(msgs)
                                .filter((key: string) => typeof msgs[key] === 'string')
                                .map((key: string) => ({ propriedade: `${endpoint}.${key}`, razao: msgs[key].replace('$$', `${endpoint}.${key}`) }));

                            const handle: [string, string] = {
                                'cob': ['Cob', "A cobrança não respeita o schema."],
                                'cobv': ['CobV', "A cobrança não respeita o schema."],
                                'cobr': ['CobR', "A cobrança não respeita o schema."],
                                'loc': ['Location', "O Location não respeita o schema."],
                                'rec': ['Rec', "A recorrência não respeita o schema."],
                            }[endpoint];

                            if (!handle) {
                                throw new BadRequestException(this.ServerErrorTypes.RequisicaoInvalida(violacoes));
                            }

                            const [prefix, detail] = handle;
                            throw new BadRequestException(this.ServerErrorTypes[400](prefix, detail, violacoes));
                        },
                        401: () => {
                            throw new UnauthorizedException(this.ServerErrorTypes[401]())
                        },
                        403: () => {
                            const res: any = err.getResponse();
                            const detail = typeof res?.detail === 'string' ? res.detail : undefined;
                            const violacoes = Array.isArray(res?.violacoes) ? res.violacoes : undefined;
                            throw new ForbiddenException(this.ServerErrorTypes[403](detail, violacoes))
                        },
                        404: () => {
                            throw new NotFoundException(this.ServerErrorTypes[err.getStatus()]())
                        },
                        500: () => {
                            console.log( err );
                            throw new InternalServerErrorException(
                                this.ServerErrorTypes[err.getStatus?.() || 500]
                            )
                        },
                        503: () => {
                            throw new ServiceUnavailableException(this.ServerErrorTypes[503]())
                        }
                    }[err.getStatus?.() || 500]

                    if (!statusHandle) {
                        throw err;
                    }

                    return statusHandle();


                })
            );
        }
        else {
            return new Observable<any>((subs) => {

                throw new UnauthorizedException(this.ServerErrorTypes[401]())
            });

        }
    }
}