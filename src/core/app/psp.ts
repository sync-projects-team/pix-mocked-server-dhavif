import { Injectable } from "@nestjs/common";
import { MemoryDB } from "../../libs/fakedb";
import { PixID, PixKey, PixRequest, TipoCob, Situacao, ModalidadeAlteracao, IPaginator, Expiracao } from "./models";
import { getMD5Hash } from "../../libs/utils";
import { randomUUID } from "crypto";
import { MESSAGES } from "../../libs/messages";
import { CobGetResponse, CobPatchRequest, CobPutRequest, CobPutResponse, CobGetFilter, CobPatchResponse } from "./models/cob";
import { LocGetResponse, LocGetFilter, LocID, LocPutRequest, LocPutResponse } from "./models/loc";
import { CobVGetFilter, CobVGetResponse, CobVPatchRequest, CobVPatchResponse, CobVPutRequest, CobVPutResponse, CobVValor } from "./models/cobv";
import { CobRPutRequest, CobRPutResponse } from "./models/cobr";
import { PoliticaRetentativa, RecPostRequest, RecRequest } from "./models/rec";
import { owners } from '../../data/db.json'

@Injectable()
export class PSP {

    private cob: MemoryDB;
    private cobR: MemoryDB;
    private cobV: MemoryDB;
    private transHist: MemoryDB;
    private locations: MemoryDB;
    private correntistas: MemoryDB;
    private loccob: MemoryDB;
    private rec: MemoryDB;

    constructor() {

        this.cob = MemoryDB.get("COB");
        this.transHist = MemoryDB.get("COB_HIST");

        this.cobR = MemoryDB.get("COBR");
        this.cobV = MemoryDB.get("COBV");

        this.locations = MemoryDB.get("LOCATIONS");
        this.correntistas = MemoryDB.get("CORRENTISTAS");
        this.loccob = MemoryDB.get("LOC_COB");

        this.rec = MemoryDB.get("REC");

    }

    private async joinLocCob(IdOwner: string, txid: string, id: number, tipoCob: TipoCob) {
        const lc1 = await this.loccob.read(IdOwner, { txid });
        const lc2 = await this.loccob.read(IdOwner, { id });

        const cob = await this.cob.read(IdOwner, { txid })
        const loc = await this.locations.read(IdOwner, { id })

        if (lc2) {
            throw new Error('LOCATION JÁ ESTÁ VINCULADO A UMA COBRANÇA');
        }
        // if (lc1) {
        //     throw new Error('COBRANÇA JÁ ESTÁ VINCULADO A UMA LOCATION');
        // }

        // if (!cob) {
        //     throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT(TipoCob[tipoCob]));
        // }

        if (!loc) {
            throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT('location'));
        }

        if (loc.tipoCob != tipoCob) {
            throw new Error(MESSAGES.Errors.defaults.UNEXPECTED_VALUE('tipoCob', loc.tipoCob));
        }

        await this.loccob.add(IdOwner, { txid, id });
    }

    private async _addCob(itm: PixRequest<CobPutRequest | CobVPutRequest>, tipoCob: TipoCob) {
        if (itm.data.valor.retirada) {
            throw new Error('NÃO IMPLEMENTADO');
        }

        if (!itm.data.valor.modalidadeAlteracao) {
            itm.data.valor.modalidadeAlteracao = ModalidadeAlteracao.NaoEditavel;
        }

        if (tipoCob == TipoCob.imediato) {
            if (!itm.data.calendario || !(itm.data.calendario as Expiracao)?.expiracao) {
                itm.data.calendario = { expiracao: 86400 }
            }
        }

        const curr = { ...itm.data, txid: itm.txid, revisao: 0, status: Situacao.Ativa, criacao: (new Date()).toJSON() };

        //INCLUI  LOCATION E TRANSAÇÃO, PARA DEPOIS VINCULÁ-LAS  
        const { id } = await this.addLoc({ tipoCob, IdOwner: itm.IdOwner })
        await this.cob.add(itm.IdOwner, curr);
        await this.joinLocCob(itm.IdOwner, itm.txid, id, tipoCob);

        return await this._readCob({ IdOwner: itm.IdOwner, txid: itm.txid });
    }

    async addCob(itm: PixRequest<CobPutRequest>): Promise<CobPutResponse> {
        return (await this._addCob(itm, TipoCob.imediato)) as CobPutResponse;
    }

    async addCobR(itm: PixRequest<CobRPutRequest>): Promise<CobRPutResponse> {


        return null;
    }

    async addCobV(itm: PixRequest<CobVPutRequest>): Promise<CobVPutResponse> {
        return (await this._addCob(itm, TipoCob.vencimento)) as CobVPutResponse;
    }

    async _readCob<T extends CobGetResponse | CobVGetResponse>(key: PixKey, revisao?: number): Promise<T> {

        const last = () => this.cob.read(key.IdOwner, { txid: key.txid });
        const hist = () => this.transHist.read(key.IdOwner, { id: getMD5Hash(key.txid, revisao) });

        const curr = revisao ? (await hist()) || (await last()) : (await last());
        if (!curr) { return undefined }

        const c = await this.correntistas.read("DEV", { chave: curr.chave });
        if (!c) { throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT('Correntista')) }


        const loccob = await this.loccob.read(key.IdOwner, { txid: curr.txid });
        let loc: LocGetResponse = undefined;

        if (loccob) {
            loc = await this.locations.read(key.IdOwner, { id: loccob.id });
            if (!loc) { throw new Error(MESSAGES.Errors.defaults.NOT_FOUNT('Location')) }
            loc.location = `pix.example.com/qr/${loc.uuid}`
        }

        const res = {
            ...curr,
            loc: loc,
            location: loc?.location
        }

        return res;
    }

    async readCob(key: PixKey, revisao?: number): Promise<CobGetResponse> {
        return await this._readCob(key, revisao);
    }

    async readCobV(key: PixKey, revisao?: number): Promise<CobVGetResponse> {
        return await this._readCob(key, revisao);
    }

    async _listCob(filter: (CobGetFilter | CobVGetFilter) & { IdOwner: string }): Promise<IPaginator & { cobs: (CobGetResponse | CobVGetResponse)[] }> {
        const res: IPaginator = {
            parametros: {
                inicio: filter.inicio,
                fim: filter.fim,
                paginacao: {
                    paginaAtual: filter.paginacao?.paginaAtual || 0,
                    itensPorPagina: filter.paginacao?.itensPorPagina || 100,
                    quantidadeDePaginas: 0,
                    quantidadeTotalDeItens: 0
                }
            }
        };

        let chave: string = undefined;

        if (filter.cnpj || filter.cpf) {
            const correntista = await this.correntistas.read("DEV", { cpfcnpj: filter.cnpj || filter.cpf })

            //CORRENTISTA NÃO ENCONTRADO RETORNA LISTA VAZIA
            if (!correntista) {
                return { ...res, cobs: [] }
            }
            else {
                chave = correntista.chave
            }
        }

        const ls = await this.cob.list(filter.IdOwner);

        let cobs = await Promise.all(
            ls.filter((f: any) => {
                const [criacao, inicio, fim] = [new Date(f.criacao), new Date(filter.inicio), new Date(filter.fim)]
                return criacao >= inicio && criacao <= fim && (!chave || f.chave === chave)
            })
                .map<Promise<CobGetResponse | CobVGetResponse>>(m => this._readCob({ IdOwner: filter.IdOwner, txid: m.txid }))
        );

        if (filter.locationPresente !== undefined) {
            cobs = cobs.filter((f: CobGetResponse) => {
                const res = (!!f.loc?.id && !!filter.locationPresente) || (!f.loc?.id && !filter.locationPresente)
                return res;
            });
        }

        const ini = res.parametros.paginacao.paginaAtual * res.parametros.paginacao.itensPorPagina;
        const fim = ini + res.parametros.paginacao.itensPorPagina;
        res.parametros.paginacao.quantidadeDePaginas = Math.ceil(cobs.length / res.parametros.paginacao.itensPorPagina)
        res.parametros.paginacao.quantidadeTotalDeItens = cobs.length;
        return { ...res, cobs: cobs.slice(ini, fim) }
    }

    async listCob(filter: CobGetFilter & { IdOwner: string }) {
        return await this._listCob(filter)
    }

    async listCobV(filter: CobVGetFilter & { IdOwner: string }) {
        return await this._listCob(filter)
    }

    async _editCob(itm: PixRequest<CobPatchRequest | CobVPatchRequest>, tipoCob: TipoCob) {
        const curr = await this._readCob(itm);
        let add = false;

        if (!curr || curr.status != Situacao.Ativa) {
            return null
        }
        else {
            if (!!itm.data.devedor || !!itm.data.solicitacaoPagador || !!itm.data.valor || !!itm.data.calendario || itm.data.status) {
                add = true
            }

            if (itm.data.loc?.id != null) {
                const lc = await this.loccob.read(itm.IdOwner, { txid: itm.txid });

                if (lc?.id != itm.data.loc.id) {
                    await this.loccob.remove(itm.IdOwner, { id: lc.id });
                    try { await this.joinLocCob(itm.IdOwner, itm.txid, itm.data.loc.id, tipoCob); }
                    catch (ex) {
                        await this.loccob.add(itm.IdOwner, { id: lc.id }); //desfaz a exclusão
                        throw ex;
                    }
                }
            }

            const histId = getMD5Hash(curr.txid, curr.revisao);
            if (add) {
                await this.transHist.add(itm.IdOwner, { id: histId, ...curr });
                curr.revisao++;

                itm.data.valor = {
                    original: itm.data.valor?.original || curr.valor.original,
                    modalidadeAlteracao: itm.data.valor?.modalidadeAlteracao || curr.valor.modalidadeAlteracao
                };

                if (tipoCob === TipoCob.vencimento && itm.data.valor) {
                    const valor = itm.data.valor as CobVValor;
                    const currV = curr.valor as CobVValor;
                    itm.data.valor = {
                        ...itm.data.valor,
                        desconto: {
                            data: valor.desconto?.data || currV.desconto.data,
                            modalidade: valor.desconto?.modalidade || currV.desconto.modalidade,
                            valorPerc: valor.desconto?.valorPerc || currV.desconto.valorPerc
                        },
                        juros: {
                            modalidade: valor.juros?.modalidade || currV.juros.modalidade,
                            valorPerc: valor.juros?.valorPerc || currV.juros.valorPerc
                        },
                        multa: {
                            modalidade: valor.multa?.modalidade || currV.multa.modalidade,
                            valorPerc: valor.multa?.valorPerc || currV.multa.valorPerc
                        }
                    }
                }

                await this.cob.update(itm.IdOwner, { txid: itm.txid }, { ...curr, ...itm.data });
            }
            else {
                await this.cob.patch(itm.IdOwner, { txid: itm.txid }, { loc: curr.loc });
            }

            return await this._readCob({ IdOwner: itm.IdOwner, txid: itm.txid });
        }
    }

    async editCob(itm: PixRequest<CobPatchRequest>): Promise<CobPatchResponse> {
        return (await this._editCob(itm, TipoCob.imediato)) as CobPatchResponse;
    }

    async editCobV(itm: PixRequest<CobVPatchRequest>): Promise<CobVPatchResponse> {
        return (await this._editCob(itm, TipoCob.vencimento)) as CobVPatchResponse;
    }

    async readLoc({ IdOwner, id }: LocID & { IdOwner: string }): Promise<LocGetResponse> {
        const itm: any = await this.locations.read(IdOwner, { id });
        if (itm) {
            const lc = await this.loccob.read(IdOwner, { id })
            return { ...itm, ...(lc?.txid ? { txid: lc?.txid } : {}), location: `pix.example.com/qr/${itm.uuid}` }
        }
    }

    async listLoc(filter: LocGetFilter & { IdOwner: string }) {

        const res = {
            parametros: {
                inicio: filter.inicio,
                fim: filter.fim,
                paginacao: {
                    paginaAtual: filter.paginacao?.paginaAtual || 0,
                    itensPorPagina: filter.paginacao?.itensPorPagina || 100,
                    quantidadeDePaginas: 0,
                    quantidadeTotalDeItens: 0
                }
            }
        };

        //Carrega Locations e correlação entre Location e Cob(x)
        const ls = await Promise.all([
            this.locations.list(filter.IdOwner),
            this.loccob.list(filter.IdOwner)
        ]).then(([_locs, _cobs]) => {

            if (filter.tipoCob !== undefined) {
                _locs = _locs.filter((f: LocGetResponse) => f.tipoCob === filter.tipoCob);
            }

            //Left Join Loc x LocCob
            return _locs.map(m => {
                const _cob = _cobs.find(f => f.id === m.id);
                return _cob ? { ...m, txid: _cob.txid, location: `pix.example.com/qr/${m.uuid}` } : m;
            })
        });

        let loc = ls.filter((f: any) => {
            const [criacao, inicio, fim] = [new Date(f.criacao), new Date(filter.inicio), new Date(filter.fim)]
            return criacao >= inicio && criacao <= fim
        })

        if (filter.txIdPresente !== undefined) {

            loc = loc.filter((f: LocGetResponse & { cob: any }) => {
                const res = (!!f.txid && !!filter.txIdPresente) || (!f.txid && !filter.txIdPresente)
                return res;
            });
        }

        const ini = res.parametros.paginacao.paginaAtual * res.parametros.paginacao.itensPorPagina;
        const fim = ini + res.parametros.paginacao.itensPorPagina;
        res.parametros.paginacao.quantidadeDePaginas = Math.ceil(loc.length / res.parametros.paginacao.itensPorPagina)
        res.parametros.paginacao.quantidadeTotalDeItens = loc.length;
        return { ...res, loc: loc.slice(ini, fim) }
    }

    async readLocUUID(IdOwner: string, uuid: string): Promise<LocGetResponse> {
        const itm: any = await this.locations.read(IdOwner, { uuid });
        if (itm) {
            const lc = await this.loccob.read(IdOwner, { id: itm.id })
            return { ...itm, txid: lc?.txid, location: `pix.example.com/qr/${itm.uuid}` }
        }
    }

    async addLoc({ tipoCob, IdOwner }: LocPutRequest & { IdOwner: string }): Promise<LocPutResponse> {
        await (() => new Promise<void>(res => setTimeout(() => res(), 100)))(); //delay -- WORKAROUND PRA EVITAR COLISÃO DE ID DURANTE OS TESTES
        const id = + new Date();
        const itm = { id, tipoCob, uuid: randomUUID().replace(/\-/g, ''), criacao: (new Date()).toJSON() };
        await this.locations.add(IdOwner, itm)
        return await this.readLoc({ IdOwner, id });
    }

    async removeLoc({ id, IdOwner }: LocID & { IdOwner: string }): Promise<boolean> {
        return await this.loccob.remove(IdOwner, { id });
    }

    async addRec(mdl: RecRequest<RecPostRequest>) {

        const own =  owners.find( f=> f.id === mdl.IdOwner )   

        if(!own){
            throw new Error( MESSAGES.Errors.defaults.NOT_FOUNT('OWNER') );
        }

        const itm = { ...mdl.data, idRec: `R${mdl.data.politicaRetentativa === PoliticaRetentativa.NaoPermite ? 'N' : 'R'}${ own.ISPB }${ new Date().toJSON().replace(/\D/g,'').substring(0,8) } `    }
        return await this.rec.add(mdl.IdOwner, itm);
    }
}

