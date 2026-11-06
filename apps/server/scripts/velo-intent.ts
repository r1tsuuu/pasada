// One-off: prints a Velo payment intent's status. Run: npx tsx scripts/velo-intent.ts <intentId>
import 'dotenv/config';
import { Velo } from '@carts1024/velo-sdk';
const v = new Velo({ apiKey: process.env.VELO_API_KEY!, environment: 'testnet' });
const i: any = await v.paymentIntents.retrieve(process.argv[2]!);
console.log(i.status, i.amount, i.payerAddress ?? '', i.txHash ?? '');
