import { Body, Controller, Get, Header, Headers, Param, Patch, Put, Query, Req, UseInterceptors } from '@nestjs/common';
import { PSP } from '../core/app/psp';
import { HttpInterceptor } from '../http.interceptor';
import { CobVGetFilter, CobVPatchRequest, CobVPutRequest } from '../core/app/models/cobv';
import { PixRequest } from '../core/app/models';
import { TxIdPipe } from '../validators/txid.pipe';

@Controller("cobv")
@UseInterceptors(HttpInterceptor)
export class CobVController {
  constructor(private readonly pspService: PSP) { }

  @Put(":txid")
  async create(@Body() data: CobVPutRequest, @Param("txid", TxIdPipe) txid, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    const itm: PixRequest<CobVPutRequest> = { IdOwner, txid, data }
    return await this.pspService.addCobV(itm);
  }

  @Get(":txid")
  async read(@Param("txid") txid, @Headers() headers, @Query() qry?) {
    const IdOwner = headers["IdOwner"];
    const itm = await this.pspService.readCobV({ IdOwner, txid }, qry?.revisao);
    return itm;
  }

  @Get()
  list(@Headers() headers, @Query() qry: CobVGetFilter) {
    const IdOwner = headers["IdOwner"];
    return this.pspService.listCobV({ ...qry, IdOwner });
  }

  @Patch(":txid")
  edit(@Body() data: CobVPatchRequest, @Param("txid") txid, @Headers() headers) {
    const IdOwner = headers["IdOwner"];
    const itm: PixRequest<CobVPatchRequest> = { IdOwner, txid, data }
    return this.pspService.editCobV(itm);
  }
}
