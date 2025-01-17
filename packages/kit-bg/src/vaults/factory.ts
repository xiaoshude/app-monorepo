/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable new-cap */
import {
  WALLET_TYPE_EXTERNAL,
  WALLET_TYPE_IMPORTED,
  WALLET_TYPE_WATCHING,
} from '@onekeyhq/shared/src/consts/dbConsts';
import {
  IMPL_BCH,
  IMPL_BTC,
  IMPL_COSMOS,
  IMPL_DOGE,
  IMPL_EVM,
  IMPL_LIGHTNING,
  IMPL_LIGHTNING_TESTNET,
  IMPL_LTC,
  IMPL_TBTC,
} from '@onekeyhq/shared/src/engine/engineConsts';
import { OneKeyInternalError } from '@onekeyhq/shared/src/errors';
import { ensureRunOnBackground } from '@onekeyhq/shared/src/utils/assertUtils';
import networkUtils from '@onekeyhq/shared/src/utils/networkUtils';

import { VaultFactory } from './base/VaultFactory';

import type { KeyringBase, KeyringBaseMock } from './base/KeyringBase';
import type { VaultBase } from './base/VaultBase';
import type { IVaultOptions } from './types';

export async function createKeyringInstance(vault: VaultBase) {
  const { walletId } = vault;

  let keyring: KeyringBase | null = null;
  const keyringMap = vault.keyringMap as Record<string, typeof KeyringBaseMock>;

  if (walletId.startsWith('hd-')) {
    keyring = new keyringMap.hd(vault);
  }
  if (walletId.startsWith('hw-')) {
    keyring = new keyringMap.hw(vault);
  }
  if (walletId === WALLET_TYPE_WATCHING) {
    keyring = new keyringMap.watching(vault);
  }
  if (walletId === WALLET_TYPE_EXTERNAL) {
    keyring = new keyringMap.external(vault);
  }
  if (walletId === WALLET_TYPE_IMPORTED) {
    keyring = new keyringMap.imported(vault);
  }

  if (!keyring) {
    throw new OneKeyInternalError(
      `Keyring Class not found for: walletId=${walletId}`,
    );
  }
  // const { keyringType } = keyring;
  // TODO interceptLogger
  return keyring;
}

export async function createVaultInstance(options: IVaultOptions) {
  ensureRunOnBackground();
  if (!options.networkId) {
    throw new Error('createVaultInstance ERROR: networkId is required');
  }
  const impl = networkUtils.getNetworkImpl({
    networkId: options.networkId,
  });
  let vault: VaultBase | null = null as unknown as VaultBase;

  // if (network.impl === IMPL_EVM) {
  //   const VaultEvm = (await import('./impls/evm/Vault')).default;
  //   vault = new VaultEvm(options);
  // }

  const vaultsLoader: Record<string, () => Promise<{ default: VaultBase }>> = {
    [IMPL_EVM]: () => import('./impls/evm/Vault') as any,
    [IMPL_BTC]: () => import('./impls/btc/Vault') as any,
    [IMPL_TBTC]: () => import('./impls/tbtc/Vault') as any,
    [IMPL_DOGE]: () => import('./impls/doge/Vault') as any,
    [IMPL_BCH]: () => import('./impls/bch/Vault') as any,
    [IMPL_LTC]: () => import('./impls/ltc/Vault') as any,
    [IMPL_COSMOS]: () => import('./impls/cosmos/Vault') as any,
    [IMPL_LIGHTNING]: () => import('./impls/lightning/Vault') as any,
    [IMPL_LIGHTNING_TESTNET]: () => import('./impls/lightning/Vault') as any,
  };
  const loader = vaultsLoader[impl];
  if (!loader) {
    throw new Error(`no vault found: impl=${impl}`);
  }
  const VaultClass = (await loader()).default;

  // @ts-ignore
  vault = new VaultClass(options);

  if (!vault) {
    throw new OneKeyInternalError(
      `Vault Class not found for: networkId=${options.networkId}, accountId=${options.accountId}`,
    );
  }

  //   const settings = createVaultSettings(options);
  //   vault.settings = settings;

  await vault.init({
    keyringCreator: createKeyringInstance,
  });
  // TODO interceptLogger
  return vault;
}

export const vaultFactory = new VaultFactory({
  vaultCreator: createVaultInstance,
});
