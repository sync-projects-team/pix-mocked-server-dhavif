import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { randomUUID } from 'crypto';
import { MemoryDB } from '../src/libs/fakedb';
import { correntistas } from '../src/data/db.json'
import { gerarCNPJ } from '../src/libs/documentos';
import { ModalidadeAlteracao } from '../src/core/app/models';
import { configureApp } from '../src/app.setup';

describe('COB', () => {
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
      it('O campo cob.calendario.expiracao é igual ou menor que zero.', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
          .send({ chave, valor: { original: "1.00" }, calendario: { expiracao: 0 } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.calendario.expiracao é igual ou menor que zero.", propriedade: "cob.calendario.expiracao" }] }));
      })

      it('O campo cob.valor.original não respeita o schema.', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
          .send({ chave, valor: { original: "abc" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.valor.original não respeita o schema.", propriedade: "cob.valor.original" }] }));
      })

      it('O campo cob.valor.original é zero.', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
          .send({ chave, valor: { original: "0.00" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.valor.original é zero.", propriedade: "cob.valor.original" }] }));
      })

      it('O campo cob.chave não respeita o schema.', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
          .send({ chave: `${chave}a`, valor: { original: "1.00" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400 }));
      })

      it('O campo cob.chave corresponde a uma conta que não pertence a este usuário recebedor.', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
          .send({ chave: gerarCNPJ(), valor: { original: "1.00" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.chave corresponde a uma conta que não pertence a este usuário recebedor.", propriedade: "cob.chave" }] }));
      });



    })

    describe('401', () => {
      it('Sem cabeçalho', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID()}`)
          .send({ chave, valor: { original: 1 } })
          .expect(401)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
      });

      it('Cabeçalho inválido', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID()}`)
          .send({ chave, valor: { original: 1 } })
          .set("mocked-token", "xpto")
          .expect(401)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
      });
    })

    describe('200', () => {
      it('Preenchimento válido', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${randomUUID().replace(/\-/g, '')}`)
          .send({ chave, valor: { original: "1.00" } })
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ chave, calendario: { expiracao: 86400 } }))
      });
    })
  })


  describe('/GET {:txid}', () => {
    describe('401', () => {
      const txId = randomUUID().replace(/\-/g, '');

      it('Sem cabeçalho', async () => {
        await request(app.getHttpServer())
          .get(`/cob/${txId}`)
          .expect(401)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
      })

      it('Cabeçalho inválido', async () => {
        await request(app.getHttpServer())
          .get(`/cob/${txId}`)
          .set("mocked-token", "xpto")
          .expect(401)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
      })
    });

    describe('404', () => {
      const txId = randomUUID().replace(/\-/g, '');

      it('txid inexistente', async () => {
        await request(app.getHttpServer())
          .get(`/cob/${txId}`)
          .set("mocked-token", "123-abc")
          .expect(404)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ status: 404 }));
      })
    });

    describe('200', () => {

      it('Preenchimento mínimo', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${txid}`)
          .send({ chave, valor: { original: "1.00" } })
          .set("mocked-token", "123-abc")
          .expect(200);

        await request(app.getHttpServer())
          .get(`/cob/${txid}`)
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ txid: txid, chave, valor: { original: "1.00", modalidadeAlteracao: ModalidadeAlteracao.NaoEditavel }, calendario: { expiracao: 86400 }, revisao: 0 }))
      });

      it('Versões anteriores', async () => {
        await request(app.getHttpServer())
          .put(`/cob/${txid}`)
          .send({ chave, valor: { original: "1.00" } })
          .set("mocked-token", "123-abc")
          .expect(200);

        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: "2.00" } })
          .set("mocked-token", "123-abc")
          .expect(200);

        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ solicitacaoPagador: "Feliz Ano Novo!" })
          .set("mocked-token", "123-abc")
          .expect(200);


        await request(app.getHttpServer())
          .get(`/cob/${txid}?revisao=0`)
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ txid: txid, chave, valor: { original: "1.00", modalidadeAlteracao: ModalidadeAlteracao.NaoEditavel }, calendario: { expiracao: 86400 }, revisao: 0 }))

        await request(app.getHttpServer())
          .get(`/cob/${txid}?revisao=1`)
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ txid: txid, chave, valor: { original: "2.00", modalidadeAlteracao: ModalidadeAlteracao.NaoEditavel }, calendario: { expiracao: 86400 }, revisao: 1 }))

        await request(app.getHttpServer())
          .get(`/cob/${txid}?revisao=2`)
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ txid: txid, chave, valor: { original: "2.00", modalidadeAlteracao: ModalidadeAlteracao.NaoEditavel }, calendario: { expiracao: 86400 }, revisao: 2, solicitacaoPagador: 'Feliz Ano Novo!' }));
      })
    });
  })


  describe('/PATCH', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .put(`/cob/${txid}`)
        .send({ chave, valor: { original: "1.00" } })
        .set("mocked-token", "123-abc")
        .expect(200);
    })

    describe('400', () => {
      it('O campo cob.calendario.expiracao é igual ou menor que zero.', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: "1.00" }, calendario: { expiracao: 0 } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.calendario.expiracao é igual ou menor que zero.", propriedade: "cob.calendario.expiracao" }] }));
      })

      it('O campo cob.valor.original não respeita o schema.', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: "abc" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.valor.original não respeita o schema.", propriedade: "cob.valor.original" }] }));
      });

      it('O campo cob.valor.original é zero.', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: "0.00" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.valor.original é zero.", propriedade: "cob.valor.original" }] }));
      });

      it('O campo cob.devedor.cpf não respeita o schema.', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ devedor: { nome: "Fulano de Tal", cpf: "abc123" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.devedor.cpf não respeita o schema.", propriedade: "cob.devedor.cpf" }] }));
      });

      it('O campo cob.devedor.cnpj não respeita o schema.', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ devedor: { nome: "Empresa de Tal", cnpj: "abc123" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.devedor.cnpj não respeita o schema.", propriedade: "cob.devedor.cnpj" }] }));
      });

      it('O campo cob.devedor.uf não respeita o schema.', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ devedor: { nome: "Fulano de Tal", cpf: "52998224725", uf: "abc123" } })
          .set("mocked-token", "123-abc")
          .expect(400)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 400, detail: "A cobrança não respeita o schema.", violacoes: [{ razao: "O campo cob.devedor.uf não respeita o schema.", propriedade: "cob.devedor.uf" }] }));
      });

    })

    describe('401', () => {
      it('Sem cabeçalho', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: 1 } })
          .expect(401)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
      });

      it('Cabeçalho inválido', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ IdOwner, chave, valor: { original: 1 } })
          .set("mocked-token", "xpto")
          .expect(401)
          .expect((res) => expect(JSON.parse(res.text)).toMatchObject({ status: 401 }));
      });
    })

    describe('404', () => {

      it('Não cadastrado', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${randomUUID()}`)
          .send({ valor: { original: "2.00" } })
          .set("mocked-token", "123-abc")
          .expect(404)
      })

      it('Excluído', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: "2.00" } })
          .set("mocked-token", "123-abc")
          .expect(200)

        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" })
          .set("mocked-token", "123-abc")
          .expect(200)

        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: "2.00" } })
          .set("mocked-token", "123-abc")
          .expect(404)
      })
    })

    describe('200', () => {

      it('mudança de valor', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ valor: { original: "2.00" } })
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ chave, calendario: { expiracao: 86400 } }))
      });

      it('mudança de expiração', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ calendario: { expiracao: 3600 } })
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ chave, calendario: { expiracao: 3600 } }))
      });

      it('exclusao', async () => {
        await request(app.getHttpServer())
          .patch(`/cob/${txid}`)
          .send({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" })
          .set("mocked-token", "123-abc")
          .expect(200)
          .expect((res: any) => expect(JSON.parse(res.text)).toMatchObject({ chave, status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }))
      });
    })



  });
})
