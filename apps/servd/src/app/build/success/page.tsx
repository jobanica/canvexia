import { redirect } from "next/navigation";

/**
 * Where the retired Xendit checkout used to send people after paying (D38).
 * Activation no longer goes through a payment page, so there is nothing to
 * wait for here; old links land back on the builder.
 */
export default function BuildSuccessPage() {
  redirect("/build");
}
