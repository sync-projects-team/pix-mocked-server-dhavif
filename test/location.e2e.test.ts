import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { randomUUID } from 'crypto';
import { MemoryDB } from '../src/libs/fakedb';
import { correntistas } from '../src/data/db.json'
import { TipoCob } from '../src/core/app/models';
import { configureApp } from '../src/app.setup';

describe('LOC', () => {
    let app: INestApplication;


    beforeAll(async () => {

        const cst = MemoryDB.create("CORRENTISTAS", ['chave']);
        MemoryDB.create("COB", ['txid']);
        MemoryDB.create("COB_HIST", ['id']);
        MemoryDB.create("LOCATIONS", ['id', 'uuid']);
        MemoryDB.create("LOC_COB", ['id', 'txid']);

        await Promise.all(correntistas.map(c => cst.add('DEV', c)));

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();


        app = moduleFixture.createNestApplication();
        configureApp(app);
        await app.init();
    });


    let IdOwner: string;
    let txid: string;
    let chave: string;

    beforeEach(() => {
        IdOwner = randomUUID();
        txid = randomUUID().replace(/\-/g, '');
        chave = correntistas[Math.floor(Math.random() * correntistas.length)].chave
    })




    describe('/PUT', () => {

        describe('400', () => {
            it('o campo tipoCob não respeita o schema.', async () => {
                await request(app.getHttpServer())
                    .put(`/loc`)
                    .send({ IdOwner, tipoCob: 4 })
                    .set("mocked-token", "123-abc")
                    .expect(400)
                    .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400 }));
            });
        })

        describe('401', () => {
            it('Sem cabeçalho', async () => {
                await request(app.getHttpServer())
                    .put(`/loc`)
                    .send({ IdOwner, tipoCob: TipoCob.imediato })
                    .expect(401)
                    .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
            });

            it('Cabeçalho inválido', async () => {
                await request(app.getHttpServer())
                    .put(`/loc`)
                    .send({ IdOwner, tipoCob: TipoCob.imediato })
                    .set("mocked-token", "xpto")
                    .expect(401)
                    .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
            });
        });


        describe('200', () => {
            it('Imediato', async () => {
                await request(app.getHttpServer())
                    .put(`/loc`)
                    .send({ IdOwner, tipoCob: TipoCob.imediato })
                    .set("mocked-token", "123-abc")
                    .expect(200)
            });

            it('Vencimento', async () => {
                await request(app.getHttpServer())
                    .put(`/loc`)
                    .send({ IdOwner, tipoCob: TipoCob.vencimento })
                    .set("mocked-token", "123-abc")
                    .expect(200)
            });
        })
    })



    describe('/GET/{id}', () => {
        describe('404', () => {
            it('id não numérico', async () => {
                const id = 'abc';
                await request(app.getHttpServer())
                    .get(`/loc/${id}`)
                    .set("mocked-token", "123-abc")
                    .expect(404)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 404 }));
            })
            it('id inexistente', async () => {
                const id = Math.round(Math.random() * 1000);
                await request(app.getHttpServer())
                    .get(`/loc/${id}`)
                    .set("mocked-token", "123-abc")
                    .expect(404)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 404 }));
            })
        })

        describe('200', () => {
            it('/loc', async () => {
                let itm: any = undefined;
                await request(app.getHttpServer())
                    .put(`/loc`)
                    .send({ tipoCob: "cob" })
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .then(v => itm = v.body);

                await request(app.getHttpServer())
                    .get(`/loc/${itm.id}`)
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject(itm))
            });

            it('/cob', async () => {
                let itm: any = undefined;
                await request(app.getHttpServer())
                    .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
                    .send({ chave, valor: { original: "1.00" } })
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .then(v => itm = v.body)


                await request(app.getHttpServer())
                    .get(`/loc/${itm.loc.id}`)
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ txid: itm.txid, id: itm.loc.id }))
            });
        })
    });


    describe('/DELETE', () => {
        describe('404', () => {
            it('id não numerico', async () => {
                const id = 'abc';
                await request(app.getHttpServer())
                    .delete(`/loc/${id}/txid`)
                    .set("mocked-token", "123-abc")
                    .expect(404)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 404 }));
            })

            it('id inexistente', async () => {
                const id = Math.round(Math.random() * 1000);
                await request(app.getHttpServer())
                    .delete(`/loc/${id}/txid`)
                    .set("mocked-token", "123-abc")
                    .expect(404)
                    .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 404 }));
            })
        });

        describe('200', () => {
            it('Preenchimento válido', async () => {
                let itm: any = undefined;
                await request(app.getHttpServer())
                    .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
                    .send({ chave, valor: { original: "1.00" } })
                    .set("mocked-token", "123-abc")
                    .expect(200)
                    .then(v => itm = v.body);

                await request(app.getHttpServer())
                    .delete(`/loc/${itm.loc.id}/txid`)
                    .set("mocked-token", "123-abc")
                    .expect(200)

            });

        });
    });
})
