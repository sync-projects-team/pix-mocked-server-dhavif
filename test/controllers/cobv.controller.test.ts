import { Test, TestingModule } from '@nestjs/testing';
import { CobVController } from '../../src/controllers/cobv.controller';
import { PSP } from '../../src/core/app/psp';
import { randomUUID } from 'crypto';
import { MemoryDB } from '../../src/libs/fakedb';
import { ModalidadeDesconto, ModalidadeJurosDiasCorridos, ModalidadeMulta, Situacao, TipoCob, ValidadeVencimento } from '../../src/core/app/models';
import { LocationController } from '../../src/controllers/location.controller';
import { correntistas } from '../../src/data/db.json'
import { addDays, flatDate } from '../../src/libs/utils';
import { CobGetFilter } from '../../src/core/app/models/cob';
import { gerarCPF } from '../../src/libs/documentos';
import { CobVPutResponse, CobVValor } from '../../src/core/app/models/cobv';

describe('CobVController', () => {
  let ctrl: CobVController;
  let ctrlLoc: LocationController;

  beforeAll(async () => {
    const cst = MemoryDB.create("CORRENTISTAS", ['chave', 'cpfcnpj']);

    MemoryDB.create("COB", ['txid']);
    MemoryDB.create("COB_HIST", ['id']);
    MemoryDB.create("LOCATIONS", ['id', 'uuid']);
    MemoryDB.create("LOC_COB", ['id', 'txid']);

    await Promise.all(correntistas.map(c => cst.add('DEV', c)));

    const app: TestingModule = await Test.createTestingModule({
      controllers: [CobVController, LocationController],
      providers: [PSP],
    }).compile();

    ctrl = app.get<CobVController>(CobVController);
    ctrlLoc = app.get<LocationController>(LocationController);

  });

  let txid: string;
  let IdOwner: string;
  let chave: string;
  let valor: CobVValor = { original: "10.00", desconto: { data: (new Date()).toJSON(), valorPerc: "1.00", modalidade: ModalidadeDesconto.ValorDiaUtil }, juros: { modalidade: ModalidadeJurosDiasCorridos.Valor, valorPerc: "1.00" }, multa: { modalidade: ModalidadeMulta.ValorFixo, valorPerc: "1.00" } }
  let calendario: ValidadeVencimento = { dataDeVencimento: (new Date()).toJSON(), validadeAposVencimento: 1 }
  beforeEach(async () => {
    txid = randomUUID().replace(/\-/g, '');
    IdOwner = randomUUID();
    chave = correntistas[Math.floor(Math.random() * correntistas.length)].chave
  });

  describe('CREATE', () => {
    it('Success', async () => await expect(ctrl.create({ chave, valor, calendario }, txid, { IdOwner })).resolves.toMatchObject({ chave, txid, valor, calendario }));
  });

  describe('READ', () => {
    it('Sucess', async () => {
      await ctrl.create({ chave, valor }, txid, { IdOwner });
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ chave, txid });
    })
  })

  describe('EDIT', () => {
    it('success', async () => {
      await ctrl.create({ chave, valor}, txid, { IdOwner });
      await expect(ctrl.edit({ valor }, txid, { IdOwner })).resolves.toMatchObject({ chave, txid, revisao: 1, status: Situacao.Ativa, loc: { tipoCob: TipoCob.vencimento } });
    });

    it('sem mudança de revisão', async () => {
      await ctrl.create({ chave, valor}, txid, { IdOwner });
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ revisao: 0, status: Situacao.Ativa, loc: { tipoCob: TipoCob.vencimento } });
      const { id } = await ctrlLoc.create({ tipoCob: TipoCob.vencimento }, { IdOwner });
      await expect(ctrl.edit({ loc: { id } }, txid, { IdOwner })).resolves.not.toThrow();
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ loc: { id }, revisao: 0, status: Situacao.Ativa });
    });
  })

  describe('CANCELAR', () => {
    it('success', async () => {
      await ctrl.create({ chave, valor}, txid, { IdOwner });
      await expect(ctrl.edit({ status: Situacao.Removida }, txid, { IdOwner })).resolves.toMatchObject({ txid, status: Situacao.Removida });
      await expect(ctrl.read(txid, { IdOwner })).resolves.toMatchObject({ txid, status: Situacao.Removida });
    });
  })

  describe("LIST", () => {
    const FILL_TEST = 11
    let lsPix: CobVPutResponse[] = [];
    beforeEach(async () => {
      lsPix = [];
      for (const c of correntistas) {
        for (let i = 0; i < FILL_TEST; i++) {
          txid = randomUUID().replace(/\-/g, '');
          lsPix.push(await ctrl.create({ chave: c.chave, valor}, txid, { IdOwner }));
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
