import { Transition } from "@headlessui/react";
import { Toaster, ToastIcon, resolveValue } from "react-hot-toast";

const Toast = () => {
  return (
    <Toaster position="bottom-right">
      {(t) => (
        <Transition
          key={t.id}
          appear
          show={t.visible}
          enter="transition-all duration-150"
          enterFrom="opacity-0 scale-50"
          enterTo="opacity-100 scale-100"
          leave="transition-all duration-150"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-75"
        >
          <div className="transform p-4 flex items-start gap-2 bg-white rounded shadow-lg">
            <ToastIcon toast={t} />
            <p className="px-2">{resolveValue(t.message, t)}</p>
          </div>
        </Transition>
      )}
    </Toaster>
  );
};

export default Toast;
