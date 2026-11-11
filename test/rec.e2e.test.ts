import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { MemoryDB } from "../src/libs/fakedb";
import { flatDate } from "../src/libs/utils";
import { AtivacaoRecorrencia, PeriodicidadeRecorrencia, PoliticaRetentativa, RecPostRequest } from "../src/core/app/models/rec";
import { gerarCPF } from "../src/libs/documentos";
import { expectPost200, expectPost201, expectPost400, expectPost401 } from "./e2e";
import { configureApp } from '../src/app.setup';

describe('REC', () => {
    let app: INestApplication;


    beforeAll(async () => {

        MemoryDB.create("REC", ['idRec']);

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        configureApp(app);
        await app.init();
    });

    let itm: RecPostRequest = {
        vinculo: {
            objeto: "Pagamento de assinatura de serviço",
            contrato: randomUUID().replace(/\-/g, ''),
            devedor: {
                cep: "26083190",
                cidade: "Nova Iguaçu",
                logradouro: "Rua Gemeos",
                uf: "RJ",
                nome: "Teste da Silva",
                cpf: gerarCPF()
            }
        },
        ativacao: { dadosJornada: { txid: randomUUID().replace(/\-/g, '') } },
        calendario: {
            dataInicial: flatDate(new Date()).toJSON(),
            periodicidade: PeriodicidadeRecorrencia.Mensal
        },
        politicaRetentativa: PoliticaRetentativa.NaoPermite,
        recebedor: {
            cep: "26083190",
            cidade: "Nova Iguaçu",
            logradouro: "Rua Gemeos",
            uf: "RJ",
            nome: "Teste da Silva",
            cpf: gerarCPF()
        },
        valor: { valorRec: "1000.00" }
    };


    describe('/POST', () => {
        describe('400', () => {
            const detail = "A recorrência não respeita o schema."
            describe('vinculo', () => {
                it('objeto: length>35', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, objeto: "".padEnd(36, 'x') } }, detail, [{ razao: "O campo rec.vinculo.objeto não respeita o schema.", propriedade: "rec.vinculo.objeto" }]));
                it('objeto: empty', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, objeto: "" } }, detail, [{ razao: "O campo rec.vinculo.objeto não respeita o schema.", propriedade: "rec.vinculo.objeto" }]));

                it('contrato: length>35', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, contrato: "".padEnd(36, 'x') } }, detail, [{ razao: "O campo rec.vinculo.contrato não respeita o schema.", propriedade: "rec.vinculo.contrato" }]));
                it('contrato: empty', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, contrato: "" } }, detail, [{ razao: "O campo rec.vinculo.contrato não respeita o schema.", propriedade: "rec.vinculo.contrato" }]));

                it('devedor: empty', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, devedor: undefined } }, detail, [{ razao: "O objeto rec.vinculo.devedor não respeita o schema.", propriedade: "rec.vinculo.devedor" }]));

                it('devedor.nome: length>200', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, devedor: { ...itm.vinculo.devedor, nome: "".padEnd(201, 'x') } } }, detail, [{ razao: "O campo rec.vinculo.devedor.nome não respeita o schema.", propriedade: "rec.vinculo.devedor.nome" }]));
                it('devedor.nome: empty', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, devedor: { ...itm.vinculo.devedor, nome: '' } } }, detail, [{ razao: "O campo rec.vinculo.devedor.nome não respeita o schema.", propriedade: "rec.vinculo.devedor.nome" }]));

                it('devedor.cpf: invalid', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, devedor: { ...itm.vinculo.devedor, cpf: "1234567890" } } }, detail, [{ razao: "O campo rec.vinculo.devedor.cpf não respeita o schema.", propriedade: "rec.vinculo.devedor.cpf" }]));
                it('devedor.cnpj: invalid', async () => await expectPost400(app, `/rec`, { ...itm, vinculo: { ...itm.vinculo, devedor: { ...itm.vinculo.devedor, cnpj: "1234567890" } } }, detail, [{ razao: "O campo rec.vinculo.devedor.cnpj não respeita o schema.", propriedade: "rec.vinculo.devedor.cnpj" }]));
            })

            describe('calendario', () => {
                it('calendario: empty', async () => expectPost400(app, `/rec`, { ...itm, calendario: undefined }, detail, [{ razao: "O objeto rec.calendario não respeita o schema.", propriedade: "rec.calendario" }]));

                it('calendario.dataInicial: empty', async () => expectPost400(app, `/rec`, { ...itm, calendario: { ...itm.calendario, dataInicial: "" } }, detail, [{ razao: "O campo rec.calendario.dataInicial não respeita o schema.", propriedade: "rec.calendario.dataInicial" }]));
                it('calendario.dataInicial: invalid', async () => expectPost400(app, `/rec`, { ...itm, calendario: { ...itm.calendario, dataInicial: "abc1234" } }, detail, [{ razao: "O campo rec.calendario.dataInicial não respeita o schema.", propriedade: "rec.calendario.dataInicial" }]));

                it('calendario.datafinal: invalid', async () => expectPost400(app, `/rec`, { ...itm, calendario: { ...itm.calendario, dataFinal: "abc1234" } }, detail, [{ razao: "O campo rec.calendario.dataFinal não respeita o schema.", propriedade: "rec.calendario.dataFinal" }]));

                it('calendario.periodicidade: empty', async () => expectPost400(app, `/rec`, { ...itm, calendario: { ...itm.calendario, periodicidade: "" } }, detail, [{ razao: "O campo rec.calendario.periodicidade não respeita o schema.", propriedade: "rec.calendario.periodicidade" }]));
                it('calendario.periodicidade: invalid', async () => expectPost400(app, `/rec`, { ...itm, calendario: { ...itm.calendario, periodicidade: "abc1234" } }, detail, [{ razao: "O campo rec.calendario.periodicidade não respeita o schema.", propriedade: "rec.calendario.periodicidade" }]));

            })

            describe('valor', () => {
                it('valor: empty', async () => expectPost400(app, `/rec`, { ...itm, valor: undefined }, detail, [{ razao: "O objeto rec.valor não respeita o schema.", propriedade: "rec.valor" }]));
                //it('valor.valorRec: empty', async () => expectPost400(app, `/rec`, { ...itm, valor: {valorRec: undefined}  }, detail, [{ razao: "O campo rec.valor.valorRec não respeita o schema.", propriedade: "rec.valor.valorRec" }]));
                it('valor.valorRec: NaN', async () => expectPost400(app, `/rec`, { ...itm, valor: { valorRec: "abc123" } }, detail, [{ razao: "O campo rec.valor.valorRec não respeita o schema.", propriedade: "rec.valor.valorRec" }]));
            })

            describe('recebedor', () => {
                it('recebedor: empty', async () => expectPost400(app, `/rec`, { ...itm, recebedor: undefined }, detail, [{ razao: "O objeto rec.recebedor não respeita o schema.", propriedade: "rec.recebedor" }]));

                it('recebedor.nome: length>200', async () => expectPost400(app, `/rec`, { ...itm, recebedor: { ...itm.recebedor, nome: "".padEnd(201, 'x') } }, detail, [{ razao: "O campo rec.recebedor.nome não respeita o schema.", propriedade: "rec.recebedor.nome" }]));
                it('recebedor.nome: empty', async () => expectPost400(app, `/rec`, { ...itm, recebedor: { ...itm.recebedor, nome: '' } }, detail, [{ razao: "O campo rec.recebedor.nome não respeita o schema.", propriedade: "rec.recebedor.nome" }]));

                it('recebedor.cpf: invalid', async () => expectPost400(app, `/rec`, { ...itm, recebedor: { ...itm.recebedor, cpf: "1234567890" } }, detail, [{ razao: "O campo rec.recebedor.cpf não respeita o schema.", propriedade: "rec.recebedor.cpf" }]));
                it('recebedor.cnpj: invalid', async () => expectPost400(app, `/rec`, { ...itm, recebedor: { ...itm.recebedor, cnpj: "1234567890" } }, detail, [{ razao: "O campo rec.recebedor.cnpj não respeita o schema.", propriedade: "rec.recebedor.cnpj" }]));
            })
        });

        describe('401', () => {
            it('Sem Cabeçalho', () => expectPost401(app, '/rec', itm, true));
            it('Cabeçalho Inválido', () => expectPost401(app, '/rec', itm, false));
        });

        describe('201', () => {
            it('sucesso', async () => await expectPost201(app, `/rec`, itm, { valor: { valorRec: "1000.00" } }));

        })
    })
})
