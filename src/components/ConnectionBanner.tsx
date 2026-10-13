import { SpinnerIcon } from './Icons';

/** 斷線時顯示在頂部列正下方。 */
export function ConnectionBanner() {
  return (
    <div class="banner" role="status">
      <SpinnerIcon />
      連線中斷，重新連線中…
    </div>
  );
}
