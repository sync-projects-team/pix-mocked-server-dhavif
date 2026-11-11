import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MemoryDB } from '../src/libs/fakedb';
import { correntistas } from '../src/data/db.json';

/**
 * Endpoints efetivamente expostos pela aplicação: usa o AppModule e a mesma
 * configuração (configureApp) do src/main.ts. Controllers testados
 * isoladamente ficam em test/controllers e test/conformidade.e2e.test.ts.
 */
const ERROR_URL = 'https://pix.bcb.gov.br/api/v2/error';
const TOKEN = '123-abc';

describe('APLICAÇÃO (AppModule + configureApp)', () => {
    let app: INestApplication;
    let chave: string;
    let txid: string;

    const novoTxid = () => randomUUID().replace(/\-/g, '');

    const expectBacen400 = (res: request.Response, type: string, detail: string, violacoes: { propriedade: string, razao: string }[]) => {
        expect(Object.keys(res.body).sort()).toEqual(['detail', 'status', 'title', 'type', 'violacoes']);
        expect(res.body).toEqual({ type: `${ERROR_URL}/${type}`, title: 'Payload Inválido', status: 400, detail, violacoes });
    };

    beforeAll(async () => {
        const cst = MemoryDB.create("CORRENTISTAS", ['chave', 'cpfcnpj']);
        MemoryDB.create("COB", ['txid']);
        MemoryDB.create("COB_HIST", ['id']);
        MemoryDB.create("LOCATIONS", ['id', 'uuid']);
        MemoryDB.create("LOC_COB", ['id', 'txid']);
        MemoryDB.create("REC", ['idRec']);
        await Promise.all(correntistas.map(c => cst.add('DEV', c)));

        const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
        app = configureApp(moduleFixture.createNestApplication());
        await app.init();
    });

    afterAll(async () => await app.close());

    beforeEach(() => {
        txid = novoTxid();
        chave = correntistas[Math.floor(Math.random() * correntistas.length)].chave;
    });

    describe('rotas registradas', () => {
        const rotas = () => app.getHttpAdapter().getInstance()._router.stack
            .filter((l: any) => l.route)
            .map((l: any) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`);

        it('expõe cob, cobv, loc e rec', () => {
            expect(rotas()).toEqual(expect.arrayContaining([
                'PUT /cob/:txid', 'PATCH /cob/:txid', 'GET /cob/:txid', 'GET /cob',
                'PUT /cobv/:txid', 'PATCH /cobv/:txid', 'GET /cobv/:txid', 'GET /cobv',
                'PUT /loc', 'GET /loc/:id', 'POST /rec',
            ]));
        });

        it('não expõe /cobr (CobRController fora do AppModule: implementação incompleta)', async () => {
            expect(rotas().filter((r: string) => r.includes('/cobr'))).toEqual([]);
            await request(app.getHttpServer()).post('/cobr').send({}).set("mocked-token", TOKEN).expect(404);
        });

        it('GET /cob/{txid} possui um único handler', () => {
            expect(rotas().filter((r: string) => r === 'GET /cob/:txid')).toHaveLength(1);
            expect(rotas().filter((r: string) => r === 'GET /cobv/:txid')).toHaveLength(1);
        });
    });

    describe('campos obrigatórios (sem skipMissingProperties)', () => {
        it('PUT /cob sem chave e sem valor', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`).send({}).set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expectBacen400(res, 'CobOperacaoInvalida', 'A cobrança não respeita o schema.', [
                    { propriedade: 'cob.chave', razao: 'O campo cob.chave não respeita o schema.' },
                    { propriedade: 'cob.valor', razao: 'O campo cob.valor não respeita o schema.' },
                ]));
        });

        it('PUT /cob sem valor.original', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`).send({ chave, valor: {} }).set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expectBacen400(res, 'CobOperacaoInvalida', 'A cobrança não respeita o schema.', [
                    { propriedade: 'cob.valor', razao: 'O campo cob.valor não respeita o schema.' },
                ]));
        });

        it('PUT /cob com devedor sem nome e sem cpf/cnpj', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`).send({ chave, valor: { original: '1.00' }, devedor: { cidade: 'X' } }).set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expectBacen400(res, 'CobOperacaoInvalida', 'A cobrança não respeita o schema.', [
                    { propriedade: 'cob.devedor.nome', razao: 'O campo cob.devedor.nome não respeita o schema.' },
                    { propriedade: 'cob.devedor.cnpj', razao: 'O campo cob.devedor.cnpj não respeita o schema.' },
                    { propriedade: 'cob.devedor.cpf', razao: 'O campo cob.devedor.cpf não respeita o schema.' },
                ]));
        });

        it('PUT /cob com chave de tipo inválido retorna 400 (não 500)', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`).send({ chave: 123, valor: { original: '1.00' } }).set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body).toMatchObject({ status: 400, violacoes: [{ propriedade: 'cob.chave' }] }));
        });

        it('PUT /cob com apenas os obrigatórios retorna 200', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`).send({ chave, valor: { original: '1.00' } }).set("mocked-token", TOKEN)
                .expect(200);
        });

        it('PUT /cob com devedor PF (nome + cpf) sem endereço retorna 200', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`).send({ chave, valor: { original: '1.00' }, devedor: { nome: 'Fulano de Tal', cpf: '52998224725' } }).set("mocked-token", TOKEN)
                .expect(200);
        });

        it('PUT /cobv sem chave e sem valor', async () => {
            await request(app.getHttpServer())
                .put(`/cobv/${txid}`).send({}).set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expectBacen400(res, 'CobVOperacaoInvalida', 'A cobrança não respeita o schema.', [
                    { propriedade: 'cobv.chave', razao: 'O campo cobv.chave não respeita o schema.' },
                    { propriedade: 'cobv.valor', razao: 'O campo cobv.valor não respeita o schema.' },
                ]));
        });

        it('PUT /loc sem tipoCob', async () => {
            await request(app.getHttpServer())
                .put(`/loc`).send({}).set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body).toMatchObject({ status: 400, violacoes: [{ propriedade: 'loc.tipoCob', razao: 'O campo loc.tipoCob não respeita o schema.' }] }));
        });

        it('POST /rec sem body', async () => {
            await request(app.getHttpServer())
                .post(`/rec`).send({}).set("mocked-token", TOKEN)
                .expect(400)
                .expect((res) => expect(res.body.violacoes.map((v: any) => v.propriedade)).toEqual(expect.arrayContaining(['rec.vinculo', 'rec.calendario', 'rec.valor', 'rec.recebedor', 'rec.ativacao'])));
        });
    });

    describe('PATCH status (finding Devin Review)', () => {
        it.each([['cob', 'CobOperacaoInvalida', 'A cobrança não respeita o schema.'], ['cobv', 'CobVOperacaoInvalida', 'A cobrança não respeita o schema.']])(
            'PATCH /%s/{txid} com status inválido retorna %s apontando o campo status', async (endpoint, type, detail) => {
                await request(app.getHttpServer())
                    .patch(`/${endpoint}/${txid}`).send({ status: 'CONCLUIDA' }).set("mocked-token", TOKEN)
                    .expect(400)
                    .expect((res) => expectBacen400(res, type, detail, [
                        { propriedade: `${endpoint}.status`, razao: `O campo ${endpoint}.status não respeita o schema.` },
                    ]));
            });

        it('PATCH /cob/{txid} sem body continua válido (CobRevisada não tem obrigatórios)', async () => {
            await request(app.getHttpServer())
                .put(`/cob/${txid}`).send({ chave, valor: { original: '1.00' } }).set("mocked-token", TOKEN).expect(200);
            await request(app.getHttpServer())
                .patch(`/cob/${txid}`).send({}).set("mocked-token", TOKEN).expect(200);
        });
    });
});
