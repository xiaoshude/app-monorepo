import { isNil, random } from 'lodash';

import type { IUnsignedMessage } from '@onekeyhq/core/src/types';
import {
  backgroundClass,
  backgroundMethod,
  toastIfError,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import { HISTORY_CONSTS } from '@onekeyhq/shared/src/engine/engineConsts';
import { PendingQueueTooLong } from '@onekeyhq/shared/src/errors';
import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';
import { getValidUnsignedMessage } from '@onekeyhq/shared/src/utils/messageUtils';
import { EReasonForNeedPassword } from '@onekeyhq/shared/types/setting';
import type {
  IDecodedTx,
  ISendTxBaseParams,
  ISendTxOnSuccessData,
} from '@onekeyhq/shared/types/tx';
import {
  EDecodedTxActionType,
  EDecodedTxStatus,
} from '@onekeyhq/shared/types/tx';

import { vaultFactory } from '../vaults/factory';

import ServiceBase from './ServiceBase';

import type {
  IBatchSignTransactionParamsBase,
  IBroadcastTransactionParams,
  IBuildDecodedTxParams,
  IBuildUnsignedTxParams,
  ISignTransactionParamsBase,
  ITransferInfo,
  IUpdateUnsignedTxParams,
} from '../vaults/types';

@backgroundClass()
class ServiceSend extends ServiceBase {
  constructor({ backgroundApi }: { backgroundApi: any }) {
    super({ backgroundApi });
  }

  @backgroundMethod()
  @toastIfError()
  public async demoSend({
    networkId,
    accountId,
  }: {
    networkId: string;
    accountId: string;
  }) {
    const vault = await vaultFactory.getVault({
      networkId,
      accountId,
    });
    const account = await this.backgroundApi.serviceAccount.getAccount({
      accountId,
      networkId,
    });
    const transferInfo: ITransferInfo = {
      from: account.address,
      to: account.address,
      amount: `0.00000${random(1, 20)}`,
      tokenInfo: {
        address: '',
        decimals: 18,
        name: 'Ethereum',
        symbol: 'ETH',
      },
    };

    // PagePreSend -> TokenInput、AmountInput、ReceiverInput -> unsignedTx
    // PageSendConfirm
    let unsignedTx = await vault.buildUnsignedTx({
      transfersInfo: [transferInfo],
    });

    // PageSendConfirm -> feeInfoEditor -> rebuild unsignedTx
    unsignedTx = await vault.updateUnsignedTx({
      unsignedTx,
      feeInfo: {
        common: {
          nativeDecimals: 18,
          nativeSymbol: 'ETH',
          feeDecimals: 9,
          feeSymbol: 'Gwei',
          nativeTokenPrice: 2000,
        },
        gas: {
          gasPrice: '0x2a', // 42
          gasLimit: '0x5208', // 21000
        },
      },
    });

    // @ts-ignore
    unsignedTx.encodedTx.nonce = '0x817'; // Nonce: 2071

    // PageSendConfirm -> password auth -> send tx
    const signedTxWithoutBroadcast = await this.signTransaction({
      networkId,
      accountId,
      unsignedTx,
      signOnly: false,
    });

    // const txid = await this.broadcastTransaction({
    //   networkId,
    //   signedTx: signedTxWithoutBroadcast,
    // });
    const txid = await this.broadcastTransactionLegacy({
      accountId,
      networkId,
      accountAddress: '',
      signedTx: signedTxWithoutBroadcast,
    });

    const signedTx = {
      ...signedTxWithoutBroadcast,
      txid,
    };

    console.log({
      vault,
      unsignedTx,
      signedTx,
      transferInfo,
      signedTxWithoutBroadcast,
    });
    return Promise.resolve('hello world');
  }

  @backgroundMethod()
  public async demoBuildDecodedTx(): Promise<IDecodedTx> {
    const networkId = 'evm--5';
    const accountId = "hd-1--m/44'/60'/0'/0/0";
    return Promise.resolve({
      txid: '0x1234567890',

      owner: '0x1959f5f4979c5cd87d5cb75c678c770515cb5e0e',
      signer: '0x1959f5f4979c5cd87d5cb75c678c770515cb5e0e',

      nonce: 1,
      actions: [
        {
          type: EDecodedTxActionType.ASSET_TRANSFER,
          assetTransfer: {
            from: '0x1959f5f4979c5cd87d5cb75c678c770515cb5e0e',
            to: '0x1959f5f4979c5cd87d5cb75c678c770515cb5e0e',
            label: 'Send',
            sends: [
              {
                from: '0x1959f5f4979c5cd87d5cb75c678c770515cb5e0e',
                to: '0x1959f5f4979c5cd87d5cb75c678c770515cb5e0e',
                tokenIdOnNetwork: '',
                label: '',
                amount: '1',
                name: 'Ethereum',
                symbol: 'ETH',
                icon: 'https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/eth.png',
              },
            ],
            receives: [],
          },
        },
      ],

      createdAt: new Date().getTime(),
      updatedAt: new Date().getTime(),

      status: EDecodedTxStatus.Pending,
      networkId,
      accountId,
      extraInfo: null,
    });
  }

  @backgroundMethod()
  async buildDecodedTx(
    params: ISendTxBaseParams & IBuildDecodedTxParams,
  ): Promise<IDecodedTx> {
    const { networkId, accountId, unsignedTx, feeInfo } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const decodedTx = await vault.buildDecodedTx({
      unsignedTx,
    });

    if (feeInfo) {
      decodedTx.totalFeeInNative = feeInfo.totalNative;
      decodedTx.totalFeeFiatValue = feeInfo.totalFiat;
    }

    return decodedTx;
  }

  @backgroundMethod()
  public async buildUnsignedTx(
    params: ISendTxBaseParams & IBuildUnsignedTxParams,
  ) {
    const {
      networkId,
      accountId,
      encodedTx,
      transfersInfo,
      approveInfo,
      wrappedInfo,
      specifiedFeeRate,
    } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    return vault.buildUnsignedTx({
      encodedTx,
      transfersInfo,
      approveInfo,
      wrappedInfo,
      specifiedFeeRate,
    });
  }

  @backgroundMethod()
  public async updateUnsignedTx(
    params: ISendTxBaseParams & IUpdateUnsignedTxParams,
  ) {
    const { networkId, accountId, unsignedTx, ...rest } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    return vault.updateUnsignedTx({ unsignedTx, ...rest });
  }

  @backgroundMethod()
  public async broadcastTransaction(params: IBroadcastTransactionParams) {
    const { networkId, signedTx, accountAddress } = params;
    const client = await this.getClient();
    const resp = await client.post<{
      data: { result: string };
    }>('/wallet/v1/account/send-transaction', {
      networkId,
      accountAddress,
      tx: signedTx.rawTx,
    });

    return resp.data.data.result;
  }

  @backgroundMethod()
  public async broadcastTransactionLegacy(
    params: IBroadcastTransactionParams & { accountId: string },
  ) {
    const { networkId, accountId } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    return vault.broadcastTransaction(params);
  }

  @backgroundMethod()
  @toastIfError()
  public async signTransaction(
    params: ISendTxBaseParams & ISignTransactionParamsBase,
  ) {
    const { networkId, accountId, unsignedTx, signOnly } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    const { password, deviceParams } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByAccount({
        accountId,
        reason: EReasonForNeedPassword.CreateTransaction,
      });
    // signTransaction
    const tx = await this.backgroundApi.serviceHardware.withHardwareProcessing(
      async () => {
        const signedTx = await vault.signTransaction({
          unsignedTx,
          password,
          deviceParams,
          signOnly,
        });
        console.log('signTx@vault.signTransaction', signedTx);
        return signedTx;
      },
      { deviceParams },
    );

    console.log('signTx@serviceSend.signTransaction', tx);

    tx.swapInfo = unsignedTx.swapInfo;
    return tx;
  }

  @backgroundMethod()
  public async signAndSendTransaction(
    params: ISendTxBaseParams & ISignTransactionParamsBase,
  ) {
    const { networkId, accountId, unsignedTx, signOnly } = params;

    const account = await this.backgroundApi.serviceAccount.getAccount({
      accountId,
      networkId,
    });

    const signedTx = await this.signTransaction({
      networkId,
      accountId,
      unsignedTx,
      signOnly, // external account should send tx here
    });

    // skip external account send, as rawTx is empty
    if (
      !signOnly &&
      !accountUtils.isExternalAccount({
        accountId,
      })
    ) {
      const txid = await this.broadcastTransaction({
        networkId,
        signedTx,
        accountAddress: account.address,
      });
      return { ...signedTx, txid };
    }

    return signedTx;
  }

  @backgroundMethod()
  @toastIfError()
  public async batchSignAndSendTransaction(
    params: ISendTxBaseParams & IBatchSignTransactionParamsBase,
  ) {
    const {
      networkId,
      accountId,
      unsignedTxs,
      feeInfo: sendSelectedFeeInfo,
      nativeAmountInfo,
      signOnly,
      sourceInfo,
    } = params;

    const newUnsignedTxs = [];
    for (let i = 0, len = unsignedTxs.length; i < len; i += 1) {
      const unsignedTx = unsignedTxs[i];
      const newUnsignedTx = await this.updateUnsignedTx({
        accountId,
        networkId,
        unsignedTx,
        feeInfo: sendSelectedFeeInfo?.feeInfo,
        nativeAmountInfo,
      });

      newUnsignedTxs.push(newUnsignedTx);
    }

    const result: ISendTxOnSuccessData[] = [];

    for (let i = 0, len = newUnsignedTxs.length; i < len; i += 1) {
      const unsignedTx = newUnsignedTxs[i];
      const signedTx = signOnly
        ? await this.signTransaction({
            unsignedTx,
            accountId,
            networkId,
            signOnly: true,
          })
        : await this.signAndSendTransaction({
            unsignedTx,
            networkId,
            accountId,
            signOnly: false,
          });

      const decodedTx = await this.buildDecodedTx({
        networkId,
        accountId,
        unsignedTx,
        feeInfo: sendSelectedFeeInfo,
      });
      await this.backgroundApi.serviceHistory.saveSendConfirmHistoryTxs({
        networkId,
        accountId,
        data: {
          signedTx,
          decodedTx,
        },
      });
      const data = {
        signedTx,
        decodedTx,
      };
      result.push(data);
      if (!signOnly) {
        await this.backgroundApi.serviceSignature.addItemFromSendProcess(
          data,
          sourceInfo,
        );
      }
      if (signedTx && !signOnly) {
        await this.backgroundApi.serviceHistory.saveSendConfirmHistoryTxs({
          networkId,
          accountId,
          data: {
            signedTx,
            decodedTx: await this.buildDecodedTx({
              networkId,
              accountId,
              unsignedTx,
            }),
          },
        });
      }
    }

    return result;
  }

  @backgroundMethod()
  public async getNextNonce({
    accountId,
    networkId,
    accountAddress,
  }: {
    accountId: string;
    networkId: string;
    accountAddress: string;
  }) {
    const { nonce: onChainNextNonce } =
      await this.backgroundApi.serviceAccountProfile.fetchAccountDetails({
        networkId,
        accountAddress,
      });
    if (isNil(onChainNextNonce)) {
      throw new Error('Get on-chain nonce failed.');
    }

    const maxPendingNonce =
      await this.backgroundApi.simpleDb.localHistory.getMaxPendingNonce({
        accountId,
        networkId,
      });
    const pendingNonceList =
      await this.backgroundApi.simpleDb.localHistory.getPendingNonceList({
        accountId,
        networkId,
      });
    let nextNonce = Math.max(
      isNil(maxPendingNonce) ? 0 : maxPendingNonce + 1,
      onChainNextNonce,
    );
    if (Number.isNaN(nextNonce)) {
      nextNonce = onChainNextNonce;
    }
    if (nextNonce > onChainNextNonce) {
      for (let i = onChainNextNonce; i < nextNonce; i += 1) {
        if (!pendingNonceList.includes(i)) {
          nextNonce = i;
          break;
        }
      }
    }

    if (nextNonce < onChainNextNonce) {
      nextNonce = onChainNextNonce;
    }

    if (
      nextNonce - onChainNextNonce >=
      HISTORY_CONSTS.PENDING_QUEUE_MAX_LENGTH
    ) {
      throw new PendingQueueTooLong(HISTORY_CONSTS.PENDING_QUEUE_MAX_LENGTH);
    }

    return nextNonce;
  }

  @backgroundMethod()
  async prepareSendConfirmUnsignedTx(
    params: ISendTxBaseParams & IBuildUnsignedTxParams,
  ) {
    const {
      networkId,
      accountId,
      unsignedTx,
      encodedTx,
      approveInfo,
      transfersInfo,
      wrappedInfo,
      swapInfo,
      specifiedFeeRate,
    } = params;

    let newUnsignedTx = unsignedTx;

    const account = await this.backgroundApi.serviceAccount.getAccount({
      accountId,
      networkId,
    });

    if (!newUnsignedTx) {
      newUnsignedTx = await this.buildUnsignedTx({
        networkId,
        accountId,
        encodedTx,
        approveInfo,
        transfersInfo,
        wrappedInfo,
        specifiedFeeRate,
      });
    }

    if (swapInfo) {
      newUnsignedTx.swapInfo = swapInfo;
    }

    const isNonceRequired = (
      await this.backgroundApi.serviceNetwork.getVaultSettings({
        networkId,
      })
    ).nonceRequired;

    if (isNonceRequired && isNil(newUnsignedTx.nonce)) {
      const nonce = await this.backgroundApi.serviceSend.getNextNonce({
        accountId,
        networkId,
        accountAddress: account.address,
      });

      newUnsignedTx = await this.backgroundApi.serviceSend.updateUnsignedTx({
        accountId,
        networkId,
        unsignedTx: newUnsignedTx,
        nonceInfo: { nonce },
      });
    }

    return newUnsignedTx;
  }

  @backgroundMethod()
  @toastIfError()
  async signMessage({
    unsignedMessage,
    networkId,
    accountId,
  }: {
    unsignedMessage?: IUnsignedMessage;
    networkId: string;
    accountId: string;
  }) {
    const vault = await vaultFactory.getVault({
      networkId,
      accountId,
    });

    let validUnsignedMessage = unsignedMessage;
    if (unsignedMessage) {
      // TODO fix message format and params in vault
      validUnsignedMessage = getValidUnsignedMessage(unsignedMessage);
    }

    if (!validUnsignedMessage) {
      throw new Error('Invalid unsigned message');
    }

    const { password } =
      await this.backgroundApi.servicePassword.promptPasswordVerifyByAccount({
        accountId,
        reason: EReasonForNeedPassword.CreateTransaction,
      });
    const [signedMessage] = await vault.keyring.signMessage({
      messages: [validUnsignedMessage],
      password,
    });

    return signedMessage;
  }

  @backgroundMethod()
  async getRawTransactions({
    networkId,
    txids,
  }: {
    networkId: string;
    txids: string[];
  }) {
    const client = await this.getClient();
    const resp = await client.post<{
      data: { transactionMap: Record<string, { rawTx: string }> };
    }>('/wallet/v1/network/raw-transaction/list', {
      networkId,
      hashList: txids,
    });

    return resp.data.data.transactionMap;
  }
}

export default ServiceSend;
