import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

@Injectable()
export class TxIdPipe implements PipeTransform<string, string> {
    transform(txid: string): string {
        if (!/^[a-zA-Z0-9]{26,35}$/.test(txid)) {
            throw new BadRequestException({ txid: 'O campo $$ não respeita o schema.' });
        }
        return txid;
    }
}
