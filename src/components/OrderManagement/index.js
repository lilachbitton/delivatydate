"use client";

import React, { useState, useEffect } from 'react';
import { Loader2, FileText, ClipboardList, Eye } from 'lucide-react';
import { db } from '@/config/firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';

const OrderManagement = () => {
  const [html2pdfLib, setHtml2pdfLib] = useState(null);
  const [jsPDFLib, setJsPDFLib] = useState(null);

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState('');
  const [deliveryDays, setDeliveryDays] = useState({});
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [productsMap, setProductsMap] = useState({});

  // טעינת הספריות html2pdf ו-jsPDF בצורה דינמית בצד הלקוח
  useEffect(() => {
    const loadLibraries = async () => {
      if (typeof window !== 'undefined') {
        const html2pdfModule = await import('html2pdf.js');
        const jsPDFModule = await import('jspdf');
        setHtml2pdfLib(() => html2pdfModule.default);
        setJsPDFLib(() => jsPDFModule.jsPDF);
      }
    };

    loadLibraries();
  }, []);

  // פונקציית עזר ליצירת HTML של טבלה
  const createTableHtml = (headers, data) => {
    return `
      <table style="width: 100%; border-collapse: collapse; direction: rtl;">
        <thead>
          <tr>
            ${headers
              .map(
                (header) => `
              <th style="
                background-color: #428bca; 
                color: white; 
                padding: 8px; 
                text-align: right;
                border: 1px solid #ddd;
              ">${header}</th>
            `
              )
              .join('')}
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (row) => `
            <tr>
              ${row
                .map(
                  (cell) => `
                <td style="
                  padding: 8px; 
                  text-align: right;
                  border: 1px solid #ddd;
                ">${cell}</td>
              `
                )
                .join('')}
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  };

  // טעינת ימי חלוקה מ-Firestore
  const loadDeliveryDays = async () => {
    try {
      const customerDeliveryRef = collection(db, 'customerDeliveryDays');
      const q = query(customerDeliveryRef);
      const querySnapshot = await getDocs(q);

      const days = {};
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // שומרים את יום החלוקה לפי שם הלקוח
        days[data.customerName] = data.deliveryDay;
      });

      setDeliveryDays(days);
    } catch (error) {
      console.error('Error loading delivery days:', error);
    }
  };

  // שליפת מוצרים והמרתם למפה sku -> name
  const fetchProducts = async () => {
    try {
      const response = await fetch('https://api.yeshinvoice.co.il/api/v1/getAllProducts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': JSON.stringify({
            secret: "094409be-bb9c-4a51-b3b5-2d15dc2d2154",
            userkey: "CWKaRN8167zMA5niguEf"
          })
        },
        body: JSON.stringify({
          PageSize: 1000,
          PageNumber: 1
        })
      });

      const data = await response.json();
      if (data.Success && data.ReturnValue) {
        const mapping = {};
        data.ReturnValue.forEach((product) => {
          mapping[product.sku] = product.name;
        });
        setProductsMap(mapping);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  // שליפת הזמנות
  const fetchOrders = async () => {
    try {
      console.log('Sending request to API...');
      const response = await fetch('https://api.yeshinvoice.co.il/api/v1/getOpenInvoices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': JSON.stringify({
            secret: "094409be-bb9c-4a51-b3b5-2d15dc2d2154",
            userkey: "CWKaRN8167zMA5niguEf"
          })
        },
        body: JSON.stringify({
          CustomerID: -1,
          PageSize: 100,
          PageNumber: 1,
          docTypeID: 2,
          from: "2024-01-01",
          to: "2030-12-31"
        })
      });

      const data = await response.json();
      console.log('API Response:', data);

      if (data.Success && data.ReturnValue) {
        setOrders(data.ReturnValue);
      } else {
        console.error('API returned unsuccessful response:', data);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchProducts(), fetchOrders(), loadDeliveryDays()]);
      setLoading(false);
    };

    loadData();
  }, []);

  // עדכון יום חלוקה עבור לקוח
  const assignDeliveryDay = async (customerName, day) => {
    try {
      // חיפוש לקוח לפי השם
      const customerResponse = await fetch('https://api.yeshinvoice.co.il/api/v1/getAllCustomers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': JSON.stringify({
            secret: "094409be-bb9c-4a51-b3b5-2d15dc2d2154",
            userkey: "CWKaRN8167zMA5niguEf"
          })
        },
        body: JSON.stringify({
          PageSize: 20,
          PageNumber: 1,
          Search: customerName,
          PortfolioID: 0,
          orderby: {
            column: "Name",
            asc: "asc"
          }
        })
      });

      const customerData = await customerResponse.json();

      if (customerData.Success && customerData.ReturnValue.length > 0) {
        const customerId = customerData.ReturnValue[0].id;

        // שמירת יום החלוקה ב-Firestore
        await setDoc(doc(db, 'customerDeliveryDays', customerId.toString()), {
          customerId,
          customerName,
          deliveryDay: day,
          lastUpdated: serverTimestamp()
        });

        // עדכון הסטייט
        setDeliveryDays((prev) => ({
          ...prev,
          [customerName]: day
        }));
      }
    } catch (error) {
      console.error('Error assigning delivery day:', error);
    }
  };

  // פונקציה אופציונלית לאיפוס ימי חלוקה
  const resetDeliveryDays = async () => {
    try {
      const customerDeliveryRef = collection(db, 'customerDeliveryDays');
      const q = query(customerDeliveryRef);
      const querySnapshot = await getDocs(q);

      const deletePromises = querySnapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      setDeliveryDays({});
    } catch (error) {
      console.error('Error resetting delivery days:', error);
    }
  };

  const formatDate = (dateStr) => {
    const [day, month, year] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  // יצירת דוח מרוכז
  const generateSummaryReport = () => {
    if (!selectedDay) return;

    const ordersForDay = orders.filter((order) => deliveryDays[order.CustomerName] === selectedDay);
    const productTotals = {};

    ordersForDay.forEach((order) => {
      order.items?.forEach((item) => {
        const productName = productsMap[item.sku] || `מוצר ${item.sku}`;
        if (!productTotals[productName]) {
          productTotals[productName] = 0;
        }
        productTotals[productName] += item.quantity;
      });
    });

    setSelectedOrderDetails({
      type: 'summary',
      day: selectedDay,
      products: Object.entries(productTotals).map(([name, quantity]) => ({
        name,
        quantity
      }))
    });
  };

  // יצירת דוח מפורט
  const generateDetailedReport = () => {
    if (!selectedDay) return;

    const ordersForDay = orders.filter((order) => deliveryDays[order.CustomerName] === selectedDay);
    const productDetails = {};

    ordersForDay.forEach((order) => {
      order.items?.forEach((item) => {
        const productName = productsMap[item.sku] || `מוצר ${item.sku}`;
        if (!productDetails[productName]) {
          productDetails[productName] = [];
        }

        productDetails[productName].push({
          orderNumber: order.DocumentNumber,
          customerName: order.CustomerName,
          quantity: item.quantity
        });
      });
    });

    setSelectedOrderDetails({
      type: 'detailed',
      day: selectedDay,
      products: Object.entries(productDetails).map(([productName, orders]) => ({
        productName,
        orders
      }))
    });
  };

  const getDayName = (day) => {
    const days = {
      sunday: 'ראשון',
      monday: 'שני',
      tuesday: 'שלישי',
      wednesday: 'רביעי',
      thursday: 'חמישי'
    };
    return days[day];
  };

  // ייצוא דוח מרוכז ל-PDF באמצעות html2pdf
  const exportSummaryToPDF = () => {
    if (!html2pdfLib) return; // וודא שהספרייה נטענה

    const tableData = selectedOrderDetails.products.map((product) => [
      product.quantity.toString(),
      product.name
    ]);

    const content = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; direction: rtl;">
        <h1 style="text-align: right; color: #333; margin-bottom: 20px;">
          דוח מרוכז - יום ${getDayName(selectedOrderDetails.day)}
        </h1>
        ${createTableHtml(['כמות', 'מוצר'], tableData)}
      </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = content;
    document.body.appendChild(element);

    const options = {
      margin: 10,
      filename: `דוח-מרוכז-${getDayName(selectedOrderDetails.day)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdfLib().from(element).set(options).save().then(() => {
      document.body.removeChild(element);
    });
  };

  // ייצוא דוח מפורט ל-PDF באמצעות html2pdf
  const exportDetailedToPDF = () => {
    if (!html2pdfLib) return; // וודא שהספרייה נטענה

    const content = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; direction: rtl;">
        <h1 style="text-align: right; color: #333; margin-bottom: 20px;">
          דוח מפורט - יום ${getDayName(selectedOrderDetails.day)}
        </h1>
        ${selectedOrderDetails.products
          .map(
            (product) => `
          <div style="margin-bottom: 30px;">
            <h2 style="text-align: right; color: #444; margin-bottom: 10px;">
              ${product.productName}
            </h2>
            ${createTableHtml(
              ['כמות', 'שם לקוח', 'מספר הזמנה'],
              [
                ...product.orders.map((order) => [
                  order.quantity.toString(),
                  order.customerName,
                  order.orderNumber
                ]),
                ['', 'סה"כ', product.orders.reduce((sum, order) => sum + order.quantity, 0).toString()]
              ]
            )}
          </div>
        `
          )
          .join('')}
      </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = content;
    document.body.appendChild(element);

    const options = {
      margin: 10,
      filename: `דוח-מפורט-${getDayName(selectedOrderDetails.day)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { 
        scale: 2,
        useCORS: true,
        letterRendering: true
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdfLib().from(element).set(options).save().then(() => {
      document.body.removeChild(element);
    });
  };

  // המרה של הזמנה לחשבונית עם העדכון החדש (עיגול אוטומטי)
  const convertToInvoice = async (order) => {
    try {
      // קודם נחפש את פרטי הלקוח המלאים
      const customerResponse = await fetch('https://api.yeshinvoice.co.il/api/v1/getAllCustomers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': JSON.stringify({
            secret: "094409be-bb9c-4a51-b3b5-2d15dc2d2154",
            userkey: "CWKaRN8167zMA5niguEf"
          })
        },
        body: JSON.stringify({
          PageSize: 1,
          PageNumber: 1,
          Search: order.CustomerName,
          PortfolioID: 0
        })
      });

      const customerData = await customerResponse.json();
      if (!customerData.Success || !customerData.ReturnValue.length) {
        throw new Error('לא נמצא לקוח מתאים');
      }

      const customer = customerData.ReturnValue[0];

      // כעת ניצור את החשבונית עם פרטי הלקוח המלאים
      const response = await fetch('https://api.yeshinvoice.co.il/api/v1.1/createDocument', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': JSON.stringify({
            secret: "094409be-bb9c-4a51-b3b5-2d15dc2d2154",
            userkey: "CWKaRN8167zMA5niguEf"
          })
        },
        body: JSON.stringify({
          DocumentType: 8, // חשבונית מס
          CurrencyID: 2, // שקל
          LangID: 359, // עברית
          vatPercentage: 18, // אחוז מע"מ
          RoundPriceAuto: true, // הוספת פרמטר העיגול האוטומטי
          roundPrice: 0, // איפוס העיגול הידני
          DateCreated: new Date().toISOString().split('T')[0],
          MaxDate: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
          statusID: 1,
          Customer: {
            ID: customer.id,
            Name: customer.name,
            NameInvoice: customer.nameInvoice || customer.name,
            NumberID: customer.numberID,
            EmailAddress: customer.emailAddress,
            Address: customer.address,
            City: customer.city,
            Phone: customer.phone,
            Phone2: customer.phone2,
            CustomKey: customer.customKey,
            ZipCode: customer.zipCode,
            CountryCode: customer.countryCode || 'IL'
          },
          items: order.items,
          fromDocID: order.ID // מזהה ההזמנה המקורית
        })
      });

      const data = await response.json();
      
      if (data.Success) {
        alert('החשבונית נוצרה בהצלחה! מספר חשבונית: ' + data.ReturnValue.docNumber);
        await fetchOrders();
      } else {
        throw new Error(data.ErrorMessage || 'שגיאה ביצירת החשבונית');
      }
    } catch (error) {
      console.error('Error converting to invoice:', error);
      alert('שגיאה ביצירת החשבונית: ' + error.message);
    }
  };

  // יצירת מופע jsPDF (לבדיקה, אם הספרייה נטענה)
  let pdfDoc;
  if (jsPDFLib) {
    pdfDoc = new jsPDFLib();
  }

  return (
    <div className="container mx-auto p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800">ניהול הזמנות</h2>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <select
            className="w-48 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
          >
            <option value="">בחר יום חלוקה</option>
            <option value="sunday">ראשון</option>
            <option value="monday">שני</option>
            <option value="tuesday">שלישי</option>
            <option value="wednesday">רביעי</option>
            <option value="thursday">חמישי</option>
          </select>

          <button
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
            onClick={generateSummaryReport}
            disabled={!selectedDay}
          >
            <FileText className="w-4 h-4" />
            דוח מרוכז
          </button>

          <button
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 flex items-center gap-2"
            onClick={generateDetailedReport}
            disabled={!selectedDay}
          >
            <ClipboardList className="w-4 h-4" />
            דוח מפורט
          </button>
          {/*
          <button
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 flex items-center gap-2"
            onClick={resetDeliveryDays}
          >
            איפוס ימי חלוקה
          </button>
          */}
        </div>

        {/* Orders Table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 border-l">מספר הזמנה</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 border-l">שם לקוח</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 border-l">תאריך</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 border-l">יום חלוקה</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-500 border-l">פעולות</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.ID} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900">{order.DocumentNumber}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{order.CustomerName}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{formatDate(order.Date)}</td>
                    <td className="px-6 py-4 text-sm">
                      <select
                        value={deliveryDays[order.CustomerName] || ''}
                        onChange={(e) => assignDeliveryDay(order.CustomerName, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      >
                        <option value="">בחר יום</option>
                        <option value="sunday">ראשון</option>
                        <option value="monday">שני</option>
                        <option value="tuesday">שלישי</option>
                        <option value="wednesday">רביעי</option>
                        <option value="thursday">חמישי</option>
                      </select>
                    </td>
                    <td className="px-6 py-4 text-sm flex flex-col gap-2">
                      <button
                        onClick={() =>
                          setSelectedOrderDetails({ type: 'single', order })
                        }
                        className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        פרטים
                      </button>
                      <button
                        onClick={() => convertToInvoice(order)}
                        className="text-green-600 hover:text-green-800 flex items-center gap-2"
                      >
                        חשבונית
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Order Details Modal */}
        {selectedOrderDetails?.type === 'single' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full m-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">
                  פרטי הזמנה {selectedOrderDetails.order.DocumentNumber}
                </h3>
                <button
                  onClick={() => setSelectedOrderDetails(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <p className="font-medium">{selectedOrderDetails.order.CustomerName}</p>
              </div>

              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">שם מוצר</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">כמות</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-gray-500">מחיר</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderDetails.order.items?.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-2">
                        {productsMap[item.sku] || `מוצר ${item.sku}`}
                      </td>
                      <td className="px-4 py-2">{item.quantity}</td>
                      <td className="px-4 py-2">{item.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary Report */}
        {selectedOrderDetails?.type === 'summary' && (
          <div className="mt-8 bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                דוח מרוכז - יום {getDayName(selectedOrderDetails.day)}
              </h3>
              <button
                onClick={exportSummaryToPDF}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
              >
                ייצוא ל-PDF
              </button>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-l">מוצר</th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-l">כמות</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrderDetails.products.map((product, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">{product.name}</td>
                    <td className="px-4 py-2">{product.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detailed Report */}
        {selectedOrderDetails?.type === 'detailed' && (
          <div className="mt-8 bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">
                דוח מפורט - יום {getDayName(selectedOrderDetails.day)}
              </h3>
              <button
                onClick={exportDetailedToPDF}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 flex items-center gap-2"
              >
                ייצוא ל-PDF
              </button>
            </div>
            {selectedOrderDetails.products.map((product, index) => (
              <div key={index} className="mb-6 last:mb-0">
                <h4 className="font-medium mb-2 text-lg border-b pb-2">
                  {product.productName}
                </h4>
                <table className="w-full mb-4">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-l">מספר הזמנה</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-l">שם לקוח</th>
                      <th className="px-4 py-2 text-right text-sm font-medium text-gray-500 border-l">כמות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.orders.map((order, orderIndex) => (
                      <tr key={orderIndex} className="border-t">
                        <td className="px-4 py-2">{order.orderNumber}</td>
                        <td className="px-4 py-2">{order.customerName}</td>
                        <td className="px-4 py-2">{order.quantity}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-medium">
                      <td colSpan="2" className="px-4 py-2 text-left">סה"כ:</td>
                      <td className="px-4 py-2">
                        {product.orders.reduce((sum, order) => sum + order.quantity, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderManagement;
