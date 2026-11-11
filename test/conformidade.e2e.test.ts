import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, HttpException, INestApplication, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { lastValueFrom, throwError } from 'rxjs';
import { MemoryDB } from '../src/libs/fakedb';
import { correntistas } from '../src/data/db.json';
import { PSP } from '../src/core/app/psp';
import { Situacao } from '../src/core/app/models';
import { HttpInterceptor } from '../src/http.interceptor';
import { CobController } from '../src/controllers/cob.controller';
import { CobVController } from '../src/controllers/cobv.controller';
import { CobRController } from '../src/controllers/cobr.controller';
import { LocationController } from '../src/controllers/location.controller';
import { configureApp } from '../src/app.setup';

const ERROR_URL = 'https://pix.bcb.gov.br/api/v2/error';
const TOKEN = '123-abc';

describe('CONFORMIDADE API PIX - controllers isolados (inclui CobRController, não registrado no AppModule)', () => {
    let app: INestApplication;
    let psp: PSP;
    let chave: string;
    let txid: string;

    beforeAll(async () => {
        const cst = MemoryDB.create("CORRENTISTAS", ['chave', 'cpfcnpj']);
        MemoryDB.create("COB", ['txid']);
        MemoryDB.create("COB_HIST", ['id']);
        MemoryDB.create("COBR", ['txid']);
        MemoryDB.create("LOCATIONS", ['id', 'uuid']);
        MemoryDB.create("LOC_COB", ['id', 'txid']);

        await Promise.all(correntistas.map(c => cst.add('DEV', c)));

        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [CobController, CobVController, CobRController, LocationController],
            providers: [PSP],
        }).compile();

        app = moduleFixture.createNestApplication();
        configureApp(app);
        await app.init();
        psp = app.get<PSP>(PSP);
    });

    afterAll(async () => await app.close());

    beforeEach(() => {
        txid = randomUUID().replace(/\-/g, '');
        chave = correntistas[Math.floor(Math.random() * correntistas.length)].chave;
    });

    afterEach(() => jest.restoreAllMocks());

    describe('ROTAS DUPLICADAS', () => {
        const routesOf = (ctrl: any) => Object.getOwnPropertyNames(ctrl.prototype)
            .filter(name => name !== 'constructor')
            .map(name => ctrl.prototype[name])
            .filter(fn => Reflect.hasMetadata(PATH_METADATA, fn))
            .map(fn => `${Reflect.getMetadata(METHOD_METADATA, fn)} ${Reflect.getMetadata(PATH_METADATA, fn)}`);

        it.each([
            ['cob', CobController],
            ['cobv', CobVController],
            ['cobr', CobRController],
            ['loc', LocationController],
        ])('%s: nenhum par método/path registrado mais de uma vez', (_, ctrl) => {
            const routes = routesOf(ctrl);
            expect(routes.length).toBeGreaterThan(0);
            expect(new Set(routes).size).toBe(routes.length);
        });

        it('GET /cob/{txid} consulta a cobrança sem removê-la', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`)
                .send({ chave, valor: { original: "1.00" } })
                .set("mocked-token", TOKEN)
                .expect(200);

            for (let i = 0; i < 2; i++) {
                await request(app.getHttpServer())
                    .get(`/cob/${txid}`)
                    .set("mocked-token", TOKEN)
                    .expect(200)
                    .expect((res) => expect(res.body).toMatchObject({ txid, chave, status: Situacao.Ativa }));
            }
        });

        it('cancelamento de cob via PATCH status REMOVIDA_PELO_USUARIO_RECEBEDOR', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`)
                .send({ chave, valor: { original: "1.00" } })
                .set("mocked-token", TOKEN)
                .expect(200);

            await request(app.getHttpServer())
                .patch(`/cob/${txid}`)
                .send({ status: Situacao.Removida })
                .set("mocked-token", TOKEN)
                .expect(200)
                .expect((res) => expect(res.body).toMatchObject({ txid, status: Situacao.Removida }));
        });
    });

    describe('400 FORMATO BACEN', () => {
        it('POST /cobr payload inválido retorna CobROperacaoInvalida', async () => {
            await request(app.getHttpServer())
                .post(`/cobr`)
                .send({ idRec: "RR1234567820240115abcdefghijk", infoAdicional: "".padEnd(141, 'x') })
                .set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body).toEqual({
                    type: `${ERROR_URL}/CobROperacaoInvalida`,
                    title: 'Payload Inválido',
                    status: 400,
                    detail: 'A cobrança não respeita o schema.',
                    violacoes: [{ propriedade: 'cobr.infoAdicional', razao: 'O campo cobr.infoAdicional não respeita o schema.' }]
                }));
        });

        it('PUT /cobr/{txid} payload inválido retorna CobROperacaoInvalida', async () => {
            await request(app.getHttpServer())
                .put(`/cobr/${txid}`)
                .send({ idRec: "", infoAdicional: "ok" })
                .set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body).toMatchObject({
                    type: `${ERROR_URL}/CobROperacaoInvalida`,
                    status: 400,
                    violacoes: [{ propriedade: 'cobr.idRec', razao: 'O campo cobr.idRec não respeita o schema.' }]
                }));
        });

        it('GET /cob com query string inválida retorna 400 (não 500)', async () => {
            await request(app.getHttpServer())
                .get(`/cob`)
                .query({ inicio: new Date(0).toJSON(), fim: new Date().toJSON(), cpf: '123' })
                .set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body).toMatchObject({
                    type: `${ERROR_URL}/CobOperacaoInvalida`,
                    status: 400,
                    violacoes: [{ propriedade: 'cob.cpf', razao: 'O campo cob.cpf não respeita o schema.' }]
                }));
        });
    });

    describe('TXID NO PUT', () => {
        it.each([
            ['cob', 'CobOperacaoInvalida', 'abc'],
            ['cob', 'CobOperacaoInvalida', randomUUID()],
            ['cob', 'CobOperacaoInvalida', ''.padEnd(36, 'a')],
            ['cobv', 'CobVOperacaoInvalida', 'abc'],
            ['cobr', 'CobROperacaoInvalida', 'abc'],
        ])('PUT /%s/{txid} com txid fora do pattern retorna %s (%s)', async (endpoint, type, invalidTxid) => {
            await request(app.getHttpServer())
                .put(`/${endpoint}/${invalidTxid}`)
                .send({ chave, valor: { original: "1.00" } })
                .set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body).toMatchObject({
                    type: `${ERROR_URL}/${type}`,
                    status: 400,
                    violacoes: [{ propriedade: `${endpoint}.txid`, razao: `O campo ${endpoint}.txid não respeita o schema.` }]
                }));
        });

        it.each([''.padEnd(26, 'a'), ''.padEnd(35, 'Z')])('PUT /cob/{txid} aceita txid nos limites do pattern (%s)', async (validTxid) => {
            await request(app.getHttpServer())
                .put(`/cob/${validTxid}`)
                .send({ chave, valor: { original: "1.00" } })
                .set("mocked-token", TOKEN)
                .expect(200)
                .expect((res) => expect(res.body).toMatchObject({ txid: validTxid }));
        });
    });

    describe('STATUS NO PATCH', () => {
        it.each([
            ['cob', 'CobOperacaoInvalida', Situacao.Concluida],
            ['cob', 'CobOperacaoInvalida', Situacao.RemovidaPSP],
            ['cobv', 'CobVOperacaoInvalida', Situacao.Concluida],
        ])('PATCH /%s/{txid} rejeita status diferente de REMOVIDA_PELO_USUARIO_RECEBEDOR (%s, %s)', async (endpoint, type, status) => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`)
                .send({ chave, valor: { original: "1.00" } })
                .set("mocked-token", TOKEN)
                .expect(200);

            await request(app.getHttpServer())
                .patch(`/${endpoint}/${txid}`)
                .send({ status })
                .set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body).toMatchObject({
                    type: `${ERROR_URL}/${type}`,
                    status: 400,
                    violacoes: [{ propriedade: `${endpoint}.status`, razao: `O campo ${endpoint}.status não respeita o schema.` }]
                }));

            await request(app.getHttpServer())
                .get(`/cob/${txid}`)
                .set("mocked-token", TOKEN)
                .expect(200)
                .expect((res) => expect(res.body).toMatchObject({ txid, status: Situacao.Ativa }));
        });
    });

    describe('401/403 ACESSO NEGADO', () => {
        it('UnauthorizedException do service retorna 401 AcessoNegado', async () => {
            jest.spyOn(psp, 'readCob').mockRejectedValueOnce(new UnauthorizedException());
            await request(app.getHttpServer())
                .get(`/cob/${txid}`)
                .set("mocked-token", TOKEN)
                .expect(401)
                .expect((res) => expect(res.body).toEqual({
                    type: `${ERROR_URL}/AcessoNegado`,
                    title: 'Acesso Negado',
                    status: 401,
                    detail: 'Access Token inválido.',
                    violacoes: []
                }));
        });

        it('ForbiddenException do service retorna 403 AcessoNegado com detail padrão', async () => {
            jest.spyOn(psp, 'readCob').mockRejectedValueOnce(new ForbiddenException());
            await request(app.getHttpServer())
                .get(`/cob/${txid}`)
                .set("mocked-token", TOKEN)
                .expect(403)
                .expect((res) => expect(res.body).toEqual({
                    type: `${ERROR_URL}/AcessoNegado`,
                    title: 'Acesso Negado',
                    status: 403,
                    detail: 'Requisição de participante autenticado que viola alguma regra de autorização.',
                    violacoes: []
                }));
        });

        it('ForbiddenException com detail/violacoes preserva os valores informados', async () => {
            const violacoes = [{ razao: 'Escopo cob.write não concedido.', propriedade: 'scope' }];
            jest.spyOn(psp, 'editCob').mockRejectedValueOnce(new ForbiddenException({ detail: 'Operação não permitida.', violacoes }));
            await request(app.getHttpServer())
                .patch(`/cob/${txid}`)
                .send({})
                .set("mocked-token", TOKEN)
                .expect(403)
                .expect((res) => expect(res.body).toEqual({
                    type: `${ERROR_URL}/AcessoNegado`,
                    title: 'Acesso Negado',
                    status: 403,
                    detail: 'Operação não permitida.',
                    violacoes
                }));
        });
    });

    describe('HttpInterceptor - fallbacks', () => {
        const interceptor = new HttpInterceptor();
        const run = (url: string, err: Error) => {
            const req = { url, method: 'POST', headers: { 'mocked-token': TOKEN } };
            const ctx = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
            return lastValueFrom(interceptor.intercept(ctx, { handle: () => throwError(() => err) }));
        };
        const catchHttp = async (p: Promise<any>): Promise<HttpException> => {
            try { await p; } catch (ex) { return ex; }
            throw new Error('exceção esperada');
        };

        it('400 em endpoint fora do mapa retorna RequisicaoInvalida genérico', async () => {
            const ex = await catchHttp(run('/outro?x=1', new BadRequestException({ campo: 'O campo $$ não respeita o schema.' })));
            expect(ex).toBeInstanceOf(BadRequestException);
            expect(ex.getResponse()).toEqual({
                type: `${ERROR_URL}/RequisicaoInvalida`,
                title: 'Requisição Inválida',
                status: 400,
                detail: 'A requisição não respeita o schema.',
                violacoes: [{ propriedade: 'outro.campo', razao: 'O campo outro.campo não respeita o schema.' }]
            });
        });

        it('400 com corpo padrão do Nest (message/error/statusCode) não quebra', async () => {
            const ex = await catchHttp(run('/cob', new BadRequestException('mensagem livre')));
            expect(ex.getStatus()).toBe(400);
            expect(ex.getResponse()).toMatchObject({ type: `${ERROR_URL}/CobOperacaoInvalida`, status: 400 });
        });

        it('503 retorna ServicoIndisponivel', async () => {
            const ex = await catchHttp(run('/cob', new ServiceUnavailableException()));
            expect(ex.getStatus()).toBe(503);
            expect(ex.getResponse()).toMatchObject({ type: `${ERROR_URL}/ServicoIndisponivel`, status: 503 });
        });

        it('status não mapeado preserva o status original', async () => {
            const ex = await catchHttp(run('/cob', new ConflictException()));
            expect(ex).toBeInstanceOf(ConflictException);
            expect(ex.getStatus()).toBe(409);
        });
    });
});
