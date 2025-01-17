/* eslint-disable @typescript-eslint/no-unused-vars */

import { splitSignature } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { serialize } from '@ethersproject/transactions';
import { omit } from 'lodash';

import type { UnsignedTransaction } from '@onekeyhq/core/src/chains/evm/sdkEvm/ethers';
import type { IEncodedTxEvm } from '@onekeyhq/core/src/chains/evm/types';
import coreChainApi from '@onekeyhq/core/src/instance/coreChainApi';
import type {
  ICoreApiGetAddressItem,
  ISignedTxPro,
  IUnsignedTxPro,
} from '@onekeyhq/core/src/types';
import { convertDeviceResponse } from '@onekeyhq/shared/src/errors/utils/deviceErrorUtils';
import { checkIsDefined } from '@onekeyhq/shared/src/utils/assertUtils';
import numberUtils from '@onekeyhq/shared/src/utils/numberUtils';
import type {
  IDeviceResponseResult,
  IDeviceSharedCallParams,
} from '@onekeyhq/shared/types/device';

import { KeyringHardwareBase } from '../../base/KeyringHardwareBase';

import type { IDBAccount } from '../../../dbs/local/types';
import type {
  IGetAddressParams,
  IPrepareHardwareAccountsParams,
  ISignTransactionParams,
} from '../../types';
import type {
  CoreApi,
  EVMSignedTx,
  EVMTransaction,
  EVMTransactionEIP1559,
} from '@onekeyfe/hd-core';

async function hardwareEvmSignTransaction({
  sdk,
  path,
  chainId,
  unsignedTx,
  deviceParams,
}: {
  sdk: CoreApi;
  path: string;
  chainId: number;
  unsignedTx: IUnsignedTxPro;
  deviceParams: IDeviceSharedCallParams;
}): Promise<ISignedTxPro> {
  const { dbDevice, deviceCommonParams } = checkIsDefined(deviceParams);
  const { connectId = '', deviceId } = dbDevice;

  let response: IDeviceResponseResult<EVMSignedTx> | undefined;
  const encodedTx = unsignedTx.encodedTx as IEncodedTxEvm;

  const isEip1559 = encodedTx.maxFeePerGas || encodedTx.maxPriorityFeePerGas;

  let txToSign: EVMTransaction | EVMTransactionEIP1559;

  const nonce = numberUtils.numberToHex(checkIsDefined(encodedTx.nonce), {
    prefix0x: true,
  });
  const gasLimit = numberUtils.numberToHex(checkIsDefined(encodedTx.gasLimit), {
    prefix0x: true,
  });

  if (isEip1559) {
    const txToSignEIP1559: EVMTransactionEIP1559 = {
      ...omit(encodedTx, 'from'),
      chainId,
      nonce,
      gasPrice: undefined,
      gasLimit,
      maxFeePerGas: checkIsDefined(encodedTx.maxFeePerGas),
      maxPriorityFeePerGas: checkIsDefined(encodedTx.maxPriorityFeePerGas),
    };
    txToSign = txToSignEIP1559;
  } else {
    const txToSignNormal: EVMTransaction = {
      ...omit(encodedTx, 'from'),
      chainId,
      nonce,
      gasPrice: checkIsDefined(encodedTx.gasPrice),
      gasLimit,
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
    };
    txToSign = txToSignNormal;
  }

  const tx: UnsignedTransaction = {
    to: txToSign.to,
    value: txToSign.value,
    gasPrice: txToSign.gasPrice,
    gasLimit: txToSign.gasLimit,
    nonce: parseInt(txToSign.nonce, 16),
    data: txToSign.data,
    chainId: txToSign.chainId,
  };

  if (isEip1559) {
    tx.type = 2;
    tx.maxFeePerGas = txToSign?.maxFeePerGas ?? undefined;
    tx.maxPriorityFeePerGas = txToSign?.maxPriorityFeePerGas ?? undefined;
  }
  const result = await convertDeviceResponse(async () =>
    sdk.evmSignTransaction(connectId, deviceId, {
      path,
      transaction: txToSign,
      ...deviceCommonParams,
    }),
  );

  const { v, r, s } = result;
  /**
   * sdk legacy return {v,r,s}; eip1559 return {recoveryParam,r,s}
   * splitSignature auto convert v to recoveryParam
   */
  const signature = splitSignature({
    v: Number(v),
    r,
    s,
  });
  const rawTx = serialize(tx, signature);
  const txid = keccak256(rawTx);
  return { txid, rawTx, encodedTx };
}

export class KeyringHardware extends KeyringHardwareBase {
  override coreApi = coreChainApi.evm.hd;

  async signTransaction(params: ISignTransactionParams): Promise<ISignedTxPro> {
    const sdk = await this.getHardwareSDKInstance();
    const path = await this.vault.getAccountPath();
    const chainId = await this.getNetworkChainId();
    const { unsignedTx } = params;
    return hardwareEvmSignTransaction({
      sdk,
      path,
      chainId: Number(chainId),
      unsignedTx,
      deviceParams: checkIsDefined(params.deviceParams),
    });
  }

  async signMessage(): Promise<string[]> {
    throw new Error('Method not implemented.');
  }

  override async prepareAccounts(
    params: IPrepareHardwareAccountsParams,
  ): Promise<IDBAccount[]> {
    const chainId = await this.getNetworkChainId();

    return this.basePrepareHdNormalAccounts(params, {
      buildAddressesInfo: async ({ usedIndexes }) => {
        const publicKeys = await this.baseGetDeviceAccountPublicKeys({
          params,
          usedIndexes,
          sdkGetPublicKeysFn: async ({
            connectId,
            deviceId,
            pathPrefix,
            pathSuffix,
            coinName,
            showOnOnekeyFn,
          }) => {
            const sdk = await this.getHardwareSDKInstance();

            const response = await sdk.evmGetAddress(connectId, deviceId, {
              ...params.deviceParams.deviceCommonParams, // passpharse params
              bundle: usedIndexes.map((index, arrIndex) => ({
                path: `${pathPrefix}/${pathSuffix.replace(
                  '{index}',
                  `${index}`,
                )}`,
                /**
                 * Search accounts not show detail at device.Only show on device when add accounts into wallet.
                 */
                showOnOneKey: showOnOnekeyFn(arrIndex),
                chainId: Number(chainId),
              })),
            });
            return response;
          },
        });

        console.log('evm-buildAddressesInfo', publicKeys);

        const ret: ICoreApiGetAddressItem[] = [];
        for (let i = 0; i < publicKeys.length; i += 1) {
          const item = publicKeys[i];
          const { path, address } = item;
          const { normalizedAddress } = await this.vault.validateAddress(
            address,
          );
          const addressInfo: ICoreApiGetAddressItem = {
            address: normalizedAddress || address,
            path,
            publicKey: '', // TODO return pub from hardware?
          };
          ret.push(addressInfo);
        }
        return ret;
      },
    });
  }
}
