import { Test, TestingModule } from '@nestjs/testing';
import { CobController } from '../../src/controllers/cob.controller';
import { PSP } from '../../src/core/app/psp';
import { randomUUID } from 'crypto';
import { MemoryDB } from '../../src/libs/fakedb';
import { Situacao, TipoCob } from '../../src/core/app/models';
import { LocationController } from '../../src/controllers/location.controller';
import { correntistas } from '../../src/data/db.json'
import { addDays, flatDate } from '../../src/libs/utils';
import { CobGetFilter, CobPutResponse } from '../../src/core/app/models/cob';
import { gerarCPF } from '../../src/libs/documentos';

describe('CobController', () => {
  let ctrl: CobController;
  let ctrlLoc: LocationController;


  beforeAll(async () => {
    const cst = MemoryDB.create("CORRENTISTAS", ['chave', 'cpfcnpj']);

    MemoryDB.create("COB", ['txid']);
    MemoryDB.create("COB_HIST", ['id']);
    MemoryDB.create("LOCATIONS", ['id', 'uuid']);
    MemoryDB.create("LOC_COB", ['id', 'txid']);

    await Promise.all(correntistas.map(c => cst.add('DEV', c)));

    const app: TestingModule = await Test.createTestingModule({
      controllers: [CobController, LocationController],
      providers: [PSP],
    }).compile();

    ctrl = app.get<CobController>(CobController);
    ctrlLoc = app.get<LocationController>(LocationController);

  });

  let txid: string;
  let IdOwner: string;
  let chave: string;

  beforeEach(async () => {
    txid = randomUUID().replace(/\-/g, '');
    IdOwner = randomUUID();
    chave = correntistas[Math.floor(Math.random() * correntistas.length)].chave
  });

  describe('ADD', () => {
    it('Success', async () => await expect(ctrl.add({ chave, valor: { original: "10.00" } }, txid, { IdOwner })).resolves.toMatchObject({ chave, txid, loc: { tipoCob: TipoCob.imediato } }));
  });

  describe('CREATE', () => {
    it('Success', async () => await expect(ctrl.create({ chave, valor: { original: "10.00" } }, { IdOwner })).resolves.toMatchObject({ chave, loc: { tipoCob: TipoCob.imediato } }));
  });

  describe('READ', () => {
    it('Sucess', async () => {

      await ctrl.add({ chave, valor: { original: "1.00" } }, txid, { IdOwner });
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ chave, txid });
    })
  })

  describe('EDIT', () => {
    it('success', async () => {
      await ctrl.add({ chave, valor: { original: "1.00" } }, txid, { IdOwner });
      await expect(ctrl.edit({ valor: { original: "2.00" } }, txid, { IdOwner })).resolves.toMatchObject({ chave, txid, revisao: 1, status: Situacao.Ativa, loc: { tipoCob: TipoCob.imediato } });
    });

    it('sem mudança de revisão', async () => {
      await ctrl.add({ chave, valor: { original: "1.00" } }, txid, { IdOwner });
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ revisao: 0, status: Situacao.Ativa, loc: { tipoCob: TipoCob.imediato } });
      const { id } = await ctrlLoc.create({ tipoCob: TipoCob.imediato }, { IdOwner });
      await expect(ctrl.edit({ loc: { id } }, txid, { IdOwner })).resolves.not.toThrow();
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ loc: { id, tipoCob: TipoCob.imediato }, revisao: 0, status: Situacao.Ativa });
    });
  })

  describe('CANCELAR', () => {
    it('success', async () => {
      await ctrl.add({ chave, valor: { original: "1.00" } }, txid, { IdOwner });
      await expect(ctrl.edit({ status: Situacao.Removida }, txid, { IdOwner })).resolves.toMatchObject({ txid, status: Situacao.Removida });
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ txid, status: Situacao.Removida });
    });


  })

  describe("LIST", () => {
    const FILL_TEST = 11
    let lsPix: CobPutResponse[] = [];
    beforeEach(async () => {
      lsPix = [];
      for (const c of correntistas) {
        for (let i = 0; i < FILL_TEST; i++) {
          txid = randomUUID().replace(/\-/g, '');
          lsPix.push(await ctrl.add({ chave: c.chave, valor: { original: (Math.floor(Math.random() * 1000) * 1.53).toFixed(2) } }, txid, { IdOwner }));
        }
      }
    })

    describe('PERIODO', () => {
      let filter: CobGetFilter = { inicio: flatDate(addDays(new Date(), -1)).toJSON(), fim: flatDate(addDays(new Date(), +1)).toJSON() };

      it('sucesso', async () => await expect(ctrl.list({ IdOwner }, filter)).resolves.not.toThrow());

      it('quantidades', async () => {
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(correntistas.length * FILL_TEST);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 1, quantidadeTotalDeItens: correntistas.length * FILL_TEST } });

      });
    })

    describe('CORRENTISTA - CPF', () => {
      let filter: CobGetFilter = { inicio: flatDate(addDays(new Date(), -1)).toJSON(), fim: flatDate(addDays(new Date(), +1)).toJSON(), cpf: correntistas[1].cpfcnpj };

      it('sucesso', async () => await expect(ctrl.list({ IdOwner }, filter)).resolves.not.toThrow());

      it('quantidades', async () => {
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(FILL_TEST);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 1, quantidadeTotalDeItens: FILL_TEST } });
      });
    })

    describe('CORRENTISTA - CNPJ', () => {
      let filter: CobGetFilter = { inicio: flatDate(addDays(new Date(), -1)).toJSON(), fim: flatDate(addDays(new Date(), +1)).toJSON(), cnpj: correntistas[0].cpfcnpj };

      it('sucesso', async () => await expect(ctrl.list({ IdOwner }, filter)).resolves.not.toThrow());

      it('quantidades', async () => {
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(FILL_TEST);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 1, quantidadeTotalDeItens: FILL_TEST } });
      });
    });

    describe('CORRENTISTA - CPF INEXISTENTE', () => {
      let filter: CobGetFilter = { inicio: flatDate(addDays(new Date(), -1)).toJSON(), fim: flatDate(addDays(new Date(), +1)).toJSON(), cpf: gerarCPF() };

      it('sucesso', async () => await expect(ctrl.list({ IdOwner }, filter)).resolves.not.toThrow());

      it('quantidades', async () => {
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(0);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 0, quantidadeTotalDeItens: 0 } });
      });
    });

    describe('LOCATION', () => {
      let filter: CobGetFilter = { inicio: flatDate(addDays(new Date(), -1)).toJSON(), fim: flatDate(addDays(new Date(), +1)).toJSON() };
      const QTD_REM = 3;
      beforeEach(async () => {
        for (let i = 0; i < QTD_REM; i++) {
          await ctrlLoc.remove({ id: lsPix[i].loc.id }, { IdOwner });
        }
      })

      it('presente', async () => {
        filter.locationPresente = true;
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(correntistas.length * FILL_TEST - QTD_REM);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 1, quantidadeTotalDeItens: correntistas.length * FILL_TEST - QTD_REM } });
      });

      it('ausente', async () => {
        filter.locationPresente = false;
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(QTD_REM);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 1, quantidadeTotalDeItens: QTD_REM } });
      });
    })

    describe('PAGINAÇÃO', () => {
      let filter: CobGetFilter = { inicio: flatDate(addDays(new Date(), -1)).toJSON(), fim: flatDate(addDays(new Date(), +1)).toJSON() };


      it('pag:1 | Tam: 5 | 5 itens', async () => {
        filter.paginacao = { itensPorPagina: 5, paginaAtual: 1 }
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(5);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 7, quantidadeTotalDeItens: correntistas.length * FILL_TEST } });

      });

      it('pag:6 | Tam: 5 | 3 itens', async () => {
        filter.paginacao = { itensPorPagina: 5, paginaAtual: 6 }
        const { parametros, cobs } = await ctrl.list({ IdOwner }, filter);
        expect(cobs).toHaveLength(3);
        expect(parametros).toMatchObject({ paginacao: { quantidadeDePaginas: 7, quantidadeTotalDeItens: correntistas.length * FILL_TEST } });
      });
    })
  })
});
