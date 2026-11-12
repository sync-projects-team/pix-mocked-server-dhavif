import { Body, Controller, Get, Header, Headers, Param, Patch, Post, Put, Query, Req, UseInterceptors } from '@nestjs/common';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import { CobGetFilter, CobPatchRequest, CobPutRequest } from '../core/app/models/cob';
import { PixRequest } from '../core/app/models';
import { randomUUID } from 'crypto';
import { TxIdPipe } from '../validators/txid.pipe';

@Controller("cob")
@UseInterceptors(HttpInterceptor)
export class CobController {
  constructor(private readonly pspService: PSP) { }

  @Put(":txid")
  async add(@Body() data: CobPutRequest, @Param("txid", TxIdPipe) txid, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    const itm: PixRequest<CobPutRequest> = { IdOwner, txid, data }
    return await this.pspService.addCob(itm);
  }

  @Post()
  async create(@Body() data: CobPutRequest, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    const txid: string = randomUUID().replace(/\-/g, '')
    const itm: PixRequest<CobPutRequest> = { IdOwner, txid, data }
    return await this.pspService.addCob(itm);
  }

  @Get(":txid")
  async read(@Param("txid") txid, @Headers() headers, @Query() qry?) {
    const IdOwner = headers["IdOwner"];
    const itm = await this.pspService.readCob({ IdOwner, txid }, qry?.revisao);
    return itm;
  }

  @Get()
  list(@Headers() headers, @Query() qry: CobGetFilter) {
    const IdOwner = headers["IdOwner"];
    return this.pspService.listCob({ ...qry, IdOwner });
  }

  @Patch(":txid")
  edit(@Body() data: CobPatchRequest, @Param("txid") txid, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    const itm: PixRequest<CobPatchRequest> = { IdOwner, txid, data }
    return this.pspService.editCob(itm);
  }

}
