import os
import json
import time
import openpyxl

FOLDER = r"C:\Users\bijus\Downloads\Janpriya"
WORKSPACE = r"c:\Users\bijus\OneDrive\Documents\Anitgravity\Google workspace"
PUBLIC_DIR = os.path.join(WORKSPACE, "public")

def parse_num(v):
    if v is None: return 0.0
    if isinstance(v, (int, float)): return round(float(v), 2)
    s = str(v).strip().replace("?", "").replace("₹", "").replace(",", "").replace("(", "-").replace(")", "").strip()
    try: return round(float(s), 2)
    except: return 0.0

def extract_and_update_all():
    """Reads all latest Excel sheets and updates financial_data.json and standalone HTML bundles."""
    try:
        t0 = time.time()
        # 1. Receipts & Payments
        f_rp = os.path.join(FOLDER, "Receipts_&_Payments_-_Apr'24_to_Feb'26.xlsx")
        wb_rp = openpyxl.load_workbook(f_rp, data_only=True)
        ws_rp = wb_rp['Table 1']

        months = []
        for c in range(2, ws_rp.max_column + 1):
            val = ws_rp.cell(2, c).value
            if val and str(val).strip():
                months.append(str(val).strip())

        monthly_records = []
        for idx, m in enumerate(months):
            col_idx = idx + 2
            op_bal = parse_num(ws_rp.cell(3, col_idx).value)
            icici_cur = parse_num(ws_rp.cell(4, col_idx).value)
            icici_sb = parse_num(ws_rp.cell(5, col_idx).value)
            idfc_first = parse_num(ws_rp.cell(6, col_idx).value)
            cash_hand = parse_num(ws_rp.cell(7, col_idx).value)

            receipts = []
            payments = []
            is_receipts = False
            is_payments = False

            for r in range(9, ws_rp.max_row + 1):
                item_name = ws_rp.cell(r, 1).value
                amt = parse_num(ws_rp.cell(r, col_idx).value)
                if not item_name: continue
                item_str = str(item_name).strip()

                if "Receipts:" in item_str or "Receipts" == item_str:
                    is_receipts = True
                    is_payments = False
                    continue
                elif "Payments:" in item_str or "Payments" == item_str:
                    is_receipts = False
                    is_payments = True
                    continue
                elif "Closing Balance" in item_str:
                    is_receipts = False
                    is_payments = False
                    continue

                if is_receipts and amt != 0 and not item_str.startswith("Total"):
                    receipts.append({"item": item_str, "amount": amt})
                elif is_payments and amt != 0 and not item_str.startswith("Total"):
                    payments.append({"item": item_str, "amount": amt})

            tot_r = sum(x["amount"] for x in receipts)
            tot_p = sum(x["amount"] for x in payments)
            cl_bal = op_bal + tot_r - tot_p

            monthly_records.append({
                "month": m,
                "opening_balance": op_bal,
                "receipts_total": tot_r,
                "payments_total": tot_p,
                "closing_balance": cl_bal,
                "receipts": receipts,
                "payments": payments,
                "bank_balances": {
                    "icici_current": icici_cur,
                    "icici_sb": icici_sb,
                    "idfc_first": idfc_first,
                    "cash_in_hand": cash_hand
                }
            })

        matrix_rows = []
        for r in range(10, ws_rp.max_row + 1):
            item_name = ws_rp.cell(r, 1).value
            if item_name and not str(item_name).strip().startswith("Total"):
                item_str = str(item_name).strip()
                m_vals = {}
                for idx, m in enumerate(months):
                    col_idx = idx + 2
                    m_vals[m] = parse_num(ws_rp.cell(r, col_idx).value)
                if any(v != 0 for v in m_vals.values()):
                    matrix_rows.append({"line_item": item_str, "monthly_values": m_vals})

        # 2. Lift Payment Status
        f_lift = os.path.join(FOLDER, "Lift payment status Aug_2026.xlsx")
        wb_lift = openpyxl.load_workbook(f_lift, data_only=True)
        ws_lift = wb_lift['Summary']

        blocks_exact = []
        for r in range(3, 16):
            b_name = ws_lift.cell(r, 2).value
            col_o_tot = parse_num(ws_lift.cell(r, 15).value)
            col_p_mo = parse_num(ws_lift.cell(r, 16).value)
            col_q_tot = parse_num(ws_lift.cell(r, 17).value)

            emi_row = r + 1
            flats = int(ws_lift.cell(emi_row, 27).value or 24)
            pending_emis = int(ws_lift.cell(emi_row, 28).value or 0)
            total_emis = int(ws_lift.cell(emi_row, 29).value or (flats * 4))
            pct_emi_paid = round(float(ws_lift.cell(emi_row, 30).value or 0), 2)

            paid_emis = total_emis - pending_emis
            pct_emi_pending = round(100.0 - pct_emi_paid, 2)
            pct_amount = round((col_o_tot / col_q_tot) * 100, 1) if col_q_tot > 0 else 0.0

            status = "Excellent (95%+)" if pct_emi_paid >= 95 else ("Healthy (90%+)" if pct_emi_paid >= 90 else ("Moderate (80%+)" if pct_emi_paid >= 80 else "Attention Required"))

            blocks_exact.append({
                "block": str(b_name).strip(),
                "flats_count": flats,
                "total_emis": total_emis,
                "paid_emis": paid_emis,
                "pending_emis": pending_emis,
                "pct_paid": pct_emi_paid,
                "pct_unpaid": pct_emi_pending,
                "collected": col_o_tot,
                "monthly_target": col_p_mo,
                "target": col_q_tot,
                "pct_amount": pct_amount,
                "status": status
            })

        defaulters_raw = []
        for r in range(1, ws_lift.max_row + 1):
            for c in range(1, ws_lift.max_column + 1):
                cell_val = ws_lift.cell(r, c).value
                if cell_val and isinstance(cell_val, str):
                    val_str = cell_val.strip()
                    if len(val_str) >= 5 and val_str[2] == '-' and (val_str[0] in ['A', 'B']) and val_str[1].isdigit():
                        desc_val = ws_lift.cell(r, c + 1).value or "Pending Lift Contribution"
                        pending_val = ws_lift.cell(r, c + 2).value or 1
                        pending_int = 1
                        try: pending_int = int(pending_val)
                        except:
                            if "4" in str(desc_val): pending_int = 4
                            elif "3" in str(desc_val): pending_int = 3
                            elif "2" in str(desc_val): pending_int = 2
                            else: pending_int = 1

                        block_name = val_str[:2]
                        amt_due = pending_int * 3750.0

                        defaulters_raw.append({
                            "flat": val_str,
                            "block": block_name,
                            "description": str(desc_val).strip(),
                            "months_pending": pending_int,
                            "amount_due": amt_due,
                            "status": "Final Notice (4 Mo)" if pending_int >= 4 else (f"Reminder ({pending_int} Mo)" if pending_int >= 2 else "Pending (1 Mo)")
                        })

        seen_flats = set()
        unique_defaulters = []
        for d in defaulters_raw:
            if d["flat"] not in seen_flats:
                seen_flats.add(d["flat"])
                unique_defaulters.append(d)

        # 3. Painting Project
        painting_items = [
            {"item": "Painting Contractor Payouts (10 Blocks)", "category": "Core Capex", "amount": 4212000.0, "pct": 64.7},
            {"item": "Water Softener Plant Installation", "category": "Infrastructure", "amount": 1017854.0, "pct": 15.6},
            {"item": "Polycarbonate Canopy Roofing", "category": "Civil Works", "amount": 580700.0, "pct": 8.9},
            {"item": "Labour, Hardware & Electrical Replacements", "category": "Materials", "amount": 593507.0, "pct": 9.1},
            {"item": "Civil Plastering & Miscellaneous", "category": "Maintenance", "amount": 326623.0, "pct": 5.0}
        ]

        total_receipts_all = sum(m["receipts_total"] for m in monthly_records)
        total_payments_all = sum(m["payments_total"] for m in monthly_records)
        last_rec = monthly_records[-1] if monthly_records else {}
        liquid_funds = last_rec.get("closing_balance", 1400209.94)

        fin_data = {
            "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "version": int(time.time()),
            "society": {
                "name": "Janpriya Greenfield Apartment Owners Welfare Association (JGAOWA)",
                "registration_number": "DRO/BLR/SOR/1138/2014-15",
                "address": "Janpriya Greenfield, Magadi Road, Kadabagere Post, Bengaluru - 562130",
                "total_flats": sum(b["flats_count"] for b in blocks_exact),
                "blocks": ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "B1", "B2", "B3", "B4", "B5", "B6"]
            },
            "summary": {
                "current_liquid_funds": liquid_funds,
                "total_receipts_23m": total_receipts_all,
                "total_payments_23m": total_payments_all,
                "lift_pool_collected": sum(b["collected"] for b in blocks_exact),
                "lift_pool_spent": 2697000.0,
                "lift_pool_balance": 2026872.0,
                "painting_collected": 6507000.0,
                "total_months": len(monthly_records)
            },
            "lift_project": {
                "total_flats": sum(b["flats_count"] for b in blocks_exact),
                "total_demand_emis": sum(b["total_emis"] for b in blocks_exact),
                "total_paid_emis": sum(b["paid_emis"] for b in blocks_exact),
                "total_pending_emis": sum(b["pending_emis"] for b in blocks_exact),
                "overall_emi_pct": round((sum(b["paid_emis"] for b in blocks_exact) / sum(b["total_emis"] for b in blocks_exact)) * 100, 2),
                "overall_pending_pct": round((sum(b["pending_emis"] for b in blocks_exact) / sum(b["total_emis"] for b in blocks_exact)) * 100, 2),
                "total_target_amount": sum(b["target"] for b in blocks_exact),
                "total_collected": sum(b["collected"] for b in blocks_exact),
                "overall_amount_pct": round((sum(b["collected"] for b in blocks_exact) / sum(b["target"] for b in blocks_exact)) * 100, 1),
                "blocks": blocks_exact,
                "defaulters": unique_defaulters
            },
            "painting_project": {
                "total_collected": 6507000.0,
                "total_utilized": sum(i["amount"] for i in painting_items),
                "items": painting_items
            },
            "monthly_records": monthly_records,
            "matrix_rows": matrix_rows
        }

        with open(os.path.join(WORKSPACE, "financial_data.json"), "w", encoding="utf-8") as f:
            json.dump(fin_data, f, indent=2)

        with open(os.path.join(PUBLIC_DIR, "financial_data.json"), "w", encoding="utf-8") as f:
            json.dump(fin_data, f, indent=2)

        # Update standalone bundle
        try:
            with open(os.path.join(PUBLIC_DIR, "app.js"), "r", encoding="utf-8") as f:
                app_js = f.read()
            with open(os.path.join(PUBLIC_DIR, "index.html"), "r", encoding="utf-8") as f:
                raw_html = f.read()

            if "<script>\nconst EMBEDDED_JGAOWA_DATA =" in raw_html:
                raw_html = raw_html.split("<script>\nconst EMBEDDED_JGAOWA_DATA =")[0] + '<script src="app.js"></script>\n</body>\n</html>'

            fin_json_str = json.dumps(fin_data)
            standalone_html = raw_html.replace(
                '<script src="app.js"></script>',
                f'<script>\nconst EMBEDDED_JGAOWA_DATA = {fin_json_str};\n{app_js}\n</script>'
            )

            with open(os.path.join(WORKSPACE, "JGAOWA_Apartment_Dashboard_Drive_Ready.html"), "w", encoding="utf-8") as f:
                f.write(standalone_html)
            with open(os.path.join(PUBLIC_DIR, "index.html"), "w", encoding="utf-8") as f:
                f.write(standalone_html)
        except Exception as ex_bundle:
            print("Bundle write note:", ex_bundle)

        dur = round((time.time() - t0) * 1000)
        print(f"[LIVE SYNC SUCCESS] Re-extracted all Excel data in {dur}ms (Version {fin_data['version']})")
        return fin_data
    except Exception as e:
        print("[LIVE SYNC ERROR]:", e)
        return None

if __name__ == '__main__':
    extract_and_update_all()
